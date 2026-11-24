# Background Jobs

## Q1. How would you process background jobs in Node.js?

### 1. Interview Question
"Sending emails, generating reports and resizing images make requests slow. How do you handle that?"

### 2. Simple Explanation
Don't do slow or non-critical work inside the HTTP request. Put a **job** on a **queue** (Redis/BullMQ, SQS, RabbitMQ), reply immediately (`202 Accepted`), and let separate **worker** processes do the work with retries.

```
Client ─POST /reports─► API ──enqueue job──► Queue (Redis)
   ◄── 202 {jobId} ──┘                         │
                                      Worker(s) pull ─► process ─► save result
Client ─GET /reports/:jobId─► status: queued | active | completed | failed
```

### 3. Real-World Scenario
Order checkout: charge card (sync, must succeed) → enqueue "send confirmation email", "update analytics", "generate invoice PDF". If the email provider is down, the order still succeeds and the email retries later.

### 4. How to Implement
1. Pick a queue: **BullMQ** (Redis) for most Node apps; SQS/RabbitMQ/Kafka for cross-service or big scale.
2. Producer: validate, enqueue small payload (IDs not blobs), return jobId.
3. Worker: separate process/deployment, concurrency setting, timeouts.
4. **Retries with exponential backoff**; dead-letter (failed) queue for inspection.
5. Make jobs **idempotent** (safe to run twice) — queues give at-least-once delivery.
6. Scheduled/recurring jobs (cron) with a single scheduler; avoid running cron inside every API instance.
7. Monitor queue depth, failures, job latency; graceful worker shutdown.

### 5. Code Example
```js
// queue.js
import { Queue, Worker } from 'bullmq';
const connection = { host: process.env.REDIS_HOST, port: 6379 };
export const emailQueue = new Queue('email', { connection });

// producer (in the API)
app.post('/orders', async (req, res) => {
  const order = await createOrder(req.body);
  await emailQueue.add('order-confirmation', { orderId: order.id }, {
    jobId: `order-confirmation:${order.id}`,          // dedupe = idempotency
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000, removeOnFail: 5000,
  });
  res.status(201).json(order);
});

// worker.js (separate process)
const worker = new Worker('email', async (job) => {
  const order = await orders.get(job.data.orderId);
  if (order.confirmationSentAt) return;               // idempotent check
  await mailer.send(order);
  await orders.markConfirmationSent(order.id);
}, { connection, concurrency: 10 });

worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'job failed'));
process.on('SIGTERM', async () => { await worker.close(); process.exit(0); });
```

### 6. Trade-offs
- Queue adds infra and eventual consistency (users see "processing").
- Redis queues: simple and fast; durability depends on Redis persistence config. SQS/Kafka: more durable/scale, more complexity.
- In-process `setTimeout`/fire-and-forget: easy but jobs vanish on crash, no retries, no visibility.

### 7. Common Mistakes
- Fire-and-forget `sendEmail()` without awaiting or catching errors.
- Non-idempotent jobs → duplicate emails/charges on retry.
- Huge payloads in the job instead of IDs.
- Running workers inside the API process so heavy jobs hurt latency.
- Infinite retries, no dead-letter strategy, no monitoring.
- Cron in every instance → job runs N times.

### 8. Interview Answer
"I keep requests fast by enqueuing slow or non-critical work to a queue like BullMQ or SQS and processing it in separate worker processes. Jobs are small, idempotent, have retries with exponential backoff and a failed/dead-letter set. The API returns 202 with a job ID and exposes status. I monitor queue depth and failures, and shut workers down gracefully."

### 9. Follow-up Questions
- At-least-once vs at-most-once vs exactly-once delivery?
- How do you guarantee a job isn't lost if the DB commit succeeds but enqueue fails? (outbox pattern)
- How do you prioritise or rate-limit jobs?
- Queue vs pub/sub vs streaming (Kafka)?
- How do you scale workers?
