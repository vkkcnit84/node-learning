# AWS and Kubernetes for Node.js (EKS, ALB, SQS, SES)

## Q1. How do you run and scale a Node.js service on EKS behind an ALB?

### 1. Interview Question
"Walk me through deploying a Node/TypeScript API on Kubernetes (EKS) and making it reliable."

### 2. Simple Explanation
`Docker image → Deployment (pods) → Service → Ingress → ALB`. Kubernetes keeps N replicas healthy; the ALB routes traffic to ready pods; the autoscaler adds pods under load. Node is single-threaded, so **scale with more small pods**, not big ones.

```
Client → ALB (TLS) → Ingress → Service → Pod(s) [Node process]
                                   ↳ HPA scales pods; Cluster Autoscaler/Karpenter scales EC2 nodes
```

### 3. Real-World Scenario
During a deploy, users see 502s because pods are killed while still handling requests and new pods receive traffic before they're ready.

### 4. How to Implement
1. **Dockerfile**: multi-stage, slim base, non-root user, `NODE_ENV=production`, run `node` directly (not `npm start`) so it receives SIGTERM.
2. **Probes**: `readinessProbe` (is it ready for traffic: DB reachable), `livenessProbe` (cheap, is the process alive), `startupProbe` for slow boots.
3. **Graceful shutdown**: on SIGTERM stop accepting, drain, close DB/queues (folder 04); add `preStop` sleep ~5–10 s so the ALB deregisters first; set `terminationGracePeriodSeconds` > drain time.
4. **Resources**: set requests/limits; use `--max-old-space-size` below the memory limit (avoid OOMKill).
5. **Scale**: HPA on CPU/RPS/custom metrics; `PodDisruptionBudget`, multiple replicas across AZs, `topologySpreadConstraints`.
6. **Config/secrets**: ConfigMaps + Secrets Manager (External Secrets), IAM Roles for Service Accounts (IRSA), never long-lived keys in env.
7. **Deploy**: rolling update with `maxUnavailable: 0`; CI/CD (GitHub Actions → ECR → Helm/Argo CD); easy rollback.

### 5. Code Example
```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: api }
spec:
  replicas: 3
  strategy: { rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } }
  template:
    spec:
      terminationGracePeriodSeconds: 40
      containers:
        - name: api
          image: 123.dkr.ecr.eu-west-1.amazonaws.com/api:1.4.2
          ports: [{ containerPort: 3000 }]
          resources: { requests: { cpu: 250m, memory: 384Mi }, limits: { memory: 512Mi } }
          env: [{ name: NODE_OPTIONS, value: "--max-old-space-size=400" }]
          readinessProbe: { httpGet: { path: /ready, port: 3000 }, periodSeconds: 5 }
          livenessProbe:  { httpGet: { path: /healthz, port: 3000 }, periodSeconds: 10 }
          lifecycle: { preStop: { exec: { command: ["sleep", "8"] } } }
```
```ts
process.on('SIGTERM', async () => {
  ready = false;                           // /ready now returns 503
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 30_000).unref();   // hard stop
});
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| EKS | Portable, powerful ecosystem | Operational complexity, cost |
| ECS/Fargate | Much simpler | Less flexible, AWS-specific |
| Lambda | No servers, scales to zero | Cold starts, limits, long-running work awkward |
| Many small pods | Resilience, bin-packing | More overhead per pod |
| Cluster module inside pod | Uses all cores | K8s already scales pods; adds complexity |

### 7. Common Mistakes
- `npm start` as PID 1 (SIGTERM never reaches Node), no graceful shutdown → 502s on deploy.
- Liveness probe that checks the DB (a DB blip restarts every pod → outage).
- No resource limits / heap larger than the container limit → OOMKilled.
- Single replica, no PDB; secrets baked into images.

### 8. Interview Answer
"I containerise with a multi-stage, non-root image running `node` directly, deploy as a Deployment with readiness, liveness and startup probes, and rolling updates with zero unavailable. For graceful deploys I mark not-ready on SIGTERM, use a short preStop sleep so the ALB drains, then close connections. I scale with HPA and spread replicas across AZs with a PDB, set memory limits with a matching Node heap size, and use IRSA and Secrets Manager rather than static credentials."

### 9. Follow-up Questions
- Readiness vs liveness vs startup probe?
- How does the ALB health check interact with pod readiness (IP target mode)?
- How do you do blue/green or canary releases?
- How do you debug a CrashLoopBackOff or OOMKilled pod?

---

## Q2. How do you build reliable asynchronous processing with SQS?

### 1. Interview Question
"Use SQS to process booking-confirmation jobs. How do you make it reliable and avoid duplicates?"

### 2. Simple Explanation
SQS is a managed queue with **at-least-once** delivery (Standard) or ordered + deduplicated (FIFO, lower throughput). A consumer receives a message, has `visibilityTimeout` seconds to process and **delete** it; if it fails or times out, the message reappears. Therefore **handlers must be idempotent**.

### 3. Real-World Scenario
A worker crashes after charging but before deleting the message → the message is redelivered → double charge, unless the handler is idempotent.

### 4. How to Implement
1. Long polling (`WaitTimeSeconds: 20`), batch receive (up to 10).
2. `VisibilityTimeout` > worst-case processing time (extend with heartbeat for long jobs).
3. **Idempotency**: store `messageId`/business key in a unique-constrained table; do work + record in one DB transaction.
4. **DLQ** with `maxReceiveCount` (e.g. 5) + alarms on DLQ depth + a redrive process.
5. **Partial batch failure**: delete only the successes.
6. Scale workers on `ApproximateNumberOfMessagesVisible` (KEDA/HPA).
7. **Outbox pattern** to publish messages atomically with a DB write.
8. Graceful shutdown: stop polling, finish in-flight, then exit.

### 5. Code Example
```ts
import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
const sqs = new SQSClient({});

while (running) {
  const { Messages = [] } = await sqs.send(new ReceiveMessageCommand({
    QueueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: 20, VisibilityTimeout: 60,
  }));
  await Promise.all(Messages.map(async (m) => {
    try {
      const job = JobSchema.parse(JSON.parse(m.Body!));
      await db.tx(async (tx) => {
        const first = await tx.markProcessed(m.MessageId!);   // INSERT ... ON CONFLICT DO NOTHING
        if (first) await handle(job, tx);
      });
      await sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: m.ReceiptHandle! }));
    } catch (err) {
      log.error({ err, id: m.MessageId }, 'job failed');   // not deleted → retried → DLQ eventually
    }
  }));
}
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| SQS Standard | Huge throughput, cheap | Duplicates, no ordering |
| SQS FIFO | Ordering, dedup | Throughput limits, group design |
| SQS vs SNS+SQS fan-out | Multiple consumers per event | More topology |
| SQS vs Kafka | SQS: simple, managed | Kafka: replay, streams, ordering at scale |
| SQS vs BullMQ/Redis | SQS: durable, no infra | BullMQ: richer features, delays, UI |

### 7. Common Mistakes
- Non-idempotent handlers; visibility timeout shorter than processing time (duplicate parallel processing).
- No DLQ/alarm → poison messages loop forever.
- Huge payloads in messages (256 KB limit) instead of an S3 pointer.
- Assuming ordering on Standard queues.

### 8. Interview Answer
"SQS gives at-least-once delivery, so I design idempotent consumers, recording a processed key in the same DB transaction as the side effect. I use long polling and batches, a visibility timeout longer than the job (with heartbeat for long ones), a DLQ with an alarm and redrive, and delete only successful messages. I scale workers on queue depth and use the outbox pattern when publishing alongside a DB write."

### 9. Follow-up Questions
- Standard vs FIFO: when do you need ordering, and how do message groups work?
- How do you handle a poison message?
- How do you guarantee "write to DB and publish message" atomically?
- How do you throttle consumers to protect a downstream API?

---

## Q3. How do you send transactional email reliably with SES?

### 1. Interview Question
"Send booking confirmations and receipts by email. How do you do it so they arrive and you don't spam?"

### 2. Simple Explanation
Email is slow, can fail, and **reputation is fragile**. Send via a queue/worker, never inline in the request; configure authentication (SPF, DKIM, DMARC); handle bounces/complaints; and respect SES limits.

### 3. Real-World Scenario
A bug re-sends a confirmation to 50k users, bounces climb above 5%, complaints rise, and SES puts the account under review, so *all* transactional mail is at risk.

### 4. How to Implement
1. Verify the domain; enable **DKIM**, SPF, **DMARC**; use a custom MAIL FROM.
2. Request/confirm **production access** (leave sandbox); watch the sending quota and rate.
3. Request → enqueue (SQS) → worker renders template → `SendEmail` with retries on throttling.
4. **Idempotency key** per (user, email type, entity) so retries/replays don't double-send.
5. **Configuration set** → SNS/EventBridge events for `Bounce`, `Complaint`, `Delivery`; maintain a **suppression list** and never email hard-bounced addresses.
6. Separate transactional from marketing (different domain/config set).
7. Store send status for support ("did the email go out?"); alarm on bounce/complaint rate.

### 5. Code Example
```ts
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
const ses = new SESv2Client({});

export async function sendConfirmation(to: string, html: string, dedupeKey: string) {
  if (await suppression.has(to)) return;                 // bounced/complained before
  if (!(await sentLog.claim(dedupeKey))) return;         // already sent (idempotent)
  await ses.send(new SendEmailCommand({
    FromEmailAddress: 'bookings@mail.example.com',
    Destination: { ToAddresses: [to] },
    Content: { Simple: { Subject: { Data: 'Booking confirmed' }, Body: { Html: { Data: html } } } },
    ConfigurationSetName: 'transactional',
  }));
}
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| SES | Cheap, AWS-native | DIY templates/analytics, reputation on you |
| SendGrid/Postmark | Better tooling/deliverability help | Cost, another vendor |
| Inline send | Simple | Slows/breaks the request |
| Queue + worker | Resilient, retryable | More moving parts |

### 7. Common Mistakes
- No bounce/complaint handling; no DMARC; sending from an unverified domain.
- Sending inside the HTTP request; retry loops that duplicate emails.
- HTML with user input unescaped (injection); secrets/PII in logs.

### 8. Interview Answer
"I never send mail inline. A request enqueues a job; a worker renders the template and calls SES with an idempotency key. I set up SPF, DKIM and DMARC, process bounce and complaint events into a suppression list, monitor bounce rates, and keep transactional and marketing mail separate so reputation problems don't spill over."

### 9. Follow-up Questions
- What happens when SES throttles you?
- How do you template emails safely and test them?
- How do you prove to support that an email was delivered?
- How would you handle a regional SES outage?
