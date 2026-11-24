# Production: Timeouts, Retries, Logging and Monitoring

## Q1. How do you handle API timeouts and retries?

### 1. Interview Question
"Your service calls a third-party API that is sometimes slow or failing. How do you make it reliable?"

### 2. Simple Explanation
- **Timeout**: don't wait forever; give up after N ms.
- **Retry**: try again for *transient* failures (network blips, 502/503/504, 429) using **exponential backoff + jitter**, a **limited** number of times.
- **Circuit breaker**: after repeated failures, stop calling for a while and fail fast / use a fallback.
- **Idempotency**: retries must be safe.

```
call ─► timeout 2s ─► fail ─► wait 200ms+jitter ─► retry ─► wait 400ms+jitter ─► retry ─► give up
                                     └─ if too many failures: breaker OPEN → fail fast → fallback
```

### 3. Real-World Scenario
A shipping-rate API became slow (30 s). Without timeouts, every checkout request hung, the connection pool and memory filled, and checkout went down. With a 2 s timeout, one retry, a circuit breaker and a cached fallback rate, checkout kept working.

### 4. How to Implement
1. Timeout on **every** outbound call (HTTP, DB, Redis) and a overall request deadline.
2. Retry only idempotent operations (GET, PUT, DELETE) or POSTs with an **idempotency key**.
3. Retry only retryable errors (network, 5xx, 429 honouring `Retry-After`); never 4xx.
4. Exponential backoff with jitter; max 2–3 attempts; total time budget < caller's timeout.
5. Circuit breaker + fallback/graceful degradation.
6. Server side: set `server.requestTimeout`, `headersTimeout`, `keepAliveTimeout` (> load balancer idle timeout).

### 5. Code Example
```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, { retries = 3, timeout = 2000, base = 200, ...opts } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) });
      if (res.ok) return res;
      if (![429, 502, 503, 504].includes(res.status) || attempt >= retries) return res;
      const ra = Number(res.headers.get('retry-after')) * 1000;
      await sleep(ra || base * 2 ** attempt * (0.5 + Math.random()));   // backoff + jitter
    } catch (err) {                                                       // timeout / network
      if (attempt >= retries) throw err;
      await sleep(base * 2 ** attempt * (0.5 + Math.random()));
    }
  }
}

// circuit breaker
import CircuitBreaker from 'opossum';
const breaker = new CircuitBreaker((args) => fetchWithRetry(args.url), {
  timeout: 3000, errorThresholdPercentage: 50, resetTimeout: 10_000,
});
breaker.fallback(() => ({ rate: cachedRate }));

// server timeouts
server.keepAliveTimeout = 65_000;   // > ALB 60s idle
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;
```

### 6. Trade-offs
- Aggressive retries: higher success but can overload a struggling service (retry storm).
- Short timeouts: fail fast, but may cut off legitimately slow calls.
- Fallbacks: availability vs stale/incorrect data.

### 7. Common Mistakes
- No timeouts (default is often infinite).
- Retrying non-idempotent calls (double charge).
- Retrying immediately without backoff/jitter; retries at every layer multiplying (3×3×3).
- Retrying 4xx errors.
- Timeout on the client longer than the server's.

### 8. Interview Answer
"I set timeouts on every outbound call, retry only transient failures of idempotent operations with exponential backoff and jitter and a small cap, and wrap flaky dependencies in a circuit breaker with a fallback. For POSTs I use idempotency keys. I keep the total retry budget inside the caller's deadline and watch for retry amplification across layers."

### 9. Follow-up Questions
- What is an idempotency key and how do you implement it?
- Retry storms / thundering herd: how to avoid?
- Where do you retry: client, service, gateway, or queue?
- Timeouts vs deadlines propagation?

---

## Q2. How do you manage logs and monitor a production Node.js app?

### 1. Interview Question
"How would you know something is wrong in production, and how would you debug it?"

### 2. Simple Explanation
Observability has three pillars:
- **Logs**: what happened (structured JSON, with request IDs).
- **Metrics**: numbers over time (RPS, error rate, latency percentiles, CPU, memory, event loop lag, DB pool usage).
- **Traces**: one request's path across services (OpenTelemetry).
Plus **alerts** on symptoms users feel, and **health checks**.

### 3. Real-World Scenario
Users reported "checkout is slow" at 2 am. Dashboards showed p99 latency up and DB pool waiting count high; the trace showed a new query without an index; the request ID in logs linked the user's error to that trace. Fixed in 20 minutes.

### 4. How to Implement
1. **Structured logging** with `pino` to stdout (JSON); the platform (Docker/K8s) ships to ELK/Loki/Datadog/CloudWatch.
2. Add `requestId` (and user/tenant id) to every log line; propagate to downstream calls.
3. Log levels; redact secrets/PII (`pino` `redact`); don't log bodies blindly.
4. **Metrics** via `prom-client` (`/metrics`): HTTP duration histogram, error counters, event loop lag, heap, pool stats, queue depth.
5. **Tracing** with OpenTelemetry auto-instrumentation.
6. **Alerts**: error rate, p95/p99 latency, saturation (CPU, memory, DB connections), restarts, queue backlog. Alert on SLO burn, not noise.
7. `/livez`, `/readyz` endpoints; uptime checks; error tracker (Sentry).

### 5. Code Example
```js
import pino from 'pino';
import pinoHttp from 'pino-http';
import client from 'prom-client';

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.authorization', '*.password'] });
app.use(pinoHttp({ logger, genReqId: (req) => req.id }));      // req.log has requestId

client.collectDefaultMetrics();                                  // CPU, heap, event loop lag, GC
const httpDur = new client.Histogram({ name: 'http_request_duration_seconds', help: 'latency',
  labelNames: ['method', 'route', 'status'], buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5] });

app.use((req, res, next) => {
  const end = httpDur.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route?.path ?? 'unknown', status: res.statusCode }));
  next();
});
app.get('/metrics', async (_req, res) => res.type(client.register.contentType).send(await client.register.metrics()));

app.get('/livez', (_req, res) => res.send('ok'));
app.get('/readyz', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.send('ready'); } catch { res.status(503).send('not ready'); }
});
```

### 6. Trade-offs
- Verbose logs: more insight but cost and noise; use sampling and levels.
- High-cardinality metric labels (user id, full URL) explode storage; use route templates.
- Tracing adds slight overhead; sample in high-traffic systems.
- Managed (Datadog) vs self-hosted (Prometheus/Grafana/Loki): convenience vs cost/control.

### 7. Common Mistakes
- `console.log` unstructured text; logging secrets/PII.
- No request/correlation ID.
- Logging only errors (no latency/metrics).
- Averages instead of percentiles; alerting on everything → alert fatigue.
- Writing logs to local files in containers without rotation.
- Not monitoring event loop lag and DB pool saturation (Node-specific).

### 8. Interview Answer
"I use structured JSON logs with pino and a request ID, metrics with Prometheus for rate, errors, latency percentiles and saturation including event loop lag and DB pool usage, and distributed tracing with OpenTelemetry. Alerts fire on user-facing symptoms like error rate and p99 latency. Health and readiness endpoints let the orchestrator restart or route around unhealthy instances, and Sentry captures exceptions with context."

### 9. Follow-up Questions
- What are the RED and USE methods?
- Log levels and what goes where?
- How do you correlate logs across microservices?
- Which Node-specific metrics matter most?
- SLI / SLO / SLA?

---

## Q3. Graceful shutdown and zero-downtime deploys
See graceful shutdown code in [../04-error-handling/error-handling.md](../04-error-handling/error-handling.md) (Q2). Add: readiness flips to 503 first, wait a few seconds for the load balancer to drain, then `server.close()`; set Kubernetes `terminationGracePeriodSeconds` > shutdown timeout; use rolling deployments with readiness probes.
