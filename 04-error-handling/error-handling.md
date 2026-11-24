# Error Handling and Keeping the API Alive

## Q1. How do you handle errors in Node.js and Express.js?

### 1. Interview Question
"How would you design error handling for a production Express API?"

### 2. Simple Explanation
Separate two kinds of errors:
- **Operational errors** (expected): bad input, record not found, DB timeout, upstream 502. Handle and return a clean response.
- **Programmer errors** (bugs): `undefined.foo`, wrong arguments. State may be corrupt: log, then restart the process.

Centralise handling in **one** error middleware and throw typed errors from anywhere.

```
handler throws AppError ─► error middleware ─► maps to {status, code, message}
                                            └► logs (with requestId), hides internals from client
unknown error ─► 500 generic message + full log + alert
```

### 3. Real-World Scenario
A payment API leaked a Postgres error message (with table names) to clients, and a missing `catch` in one async route hung requests forever. Standardising errors fixed both.

### 4. How to Implement
1. Define `AppError(status, code, message, {cause, expose})` and subclasses.
2. Validate input and throw `400/422`.
3. Make async errors reach middleware (Express 5 does it; Express 4 needs a wrapper).
4. One error middleware: log with request id, map known errors, return generic 500 for unknown.
5. Process-level handlers for `unhandledRejection` / `uncaughtException`: log, then graceful exit.
6. Return a consistent JSON shape.

### 5. Code Example
```js
// errors.js
export class AppError extends Error {
  constructor(status, code, message, { cause, details } = {}) {
    super(message, { cause });
    this.status = status; this.code = code; this.details = details;
    this.expose = status < 500;
  }
}
export const notFound = (req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', `${req.method} ${req.path} not found`));

import { ZodError } from 'zod';
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return _next(err);        // delegate if already streaming
  if (err instanceof ZodError) err = new AppError(422, 'VALIDATION', 'Invalid input', { details: err.flatten() });
  if (err.code === '23505') err = new AppError(409, 'CONFLICT', 'Already exists'); // pg unique violation

  const status = err.status ?? 500;
  req.log?.[status >= 500 ? 'error' : 'warn']({ err, requestId: req.id });
  res.status(status).json({
    error: {
      code: err.code ?? 'INTERNAL',
      message: err.expose ? err.message : 'Something went wrong',
      details: err.details,
      requestId: req.id,
    },
  });
}

// Express 4 helper
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

### 6. Trade-offs
- Typed errors + central handler: consistent, easy to test; slight upfront boilerplate.
- Result objects (`{ok, error}`) instead of throw: explicit, but verbose in JS and easy to ignore.

### 7. Common Mistakes
- `try/catch` that swallows errors (`catch {}`) or logs and continues.
- Throwing inside callbacks / `setTimeout` / event emitters where nothing catches it.
- Sending stack traces to clients.
- Forgetting `await` inside `try` so the rejection escapes.
- Mixing `res.send` and `next(err)`.

### 8. Interview Answer
"I distinguish operational errors, which I handle and map to clean responses, from programmer errors, which I log and restart on. I throw typed AppErrors, validate input at the edge, and have a single error middleware that logs with a request ID, maps known errors to status codes and returns a generic 500 for unknowns. Async errors are forwarded using Express 5 or a wrapper, and process-level handlers do a graceful shutdown."

### 9. Follow-up Questions
- Why is it unsafe to keep running after `uncaughtException`?
- How do you handle errors in streams and event emitters (`'error'` event)?
- 400 vs 422? 401 vs 403? 502 vs 503 vs 504?
- How do you correlate an error across microservices?

---

## Q2. How do you prevent an API from crashing?

### 1. Interview Question
"What measures keep a Node.js API from going down in production?"

### 2. Simple Explanation
You can't prevent every bug, so you build layers: **prevent** overload and bad input, **contain** failures, **recover** fast.

### 3. Real-World Scenario
A Black Friday spike plus a slow third-party shipping API caused requests to pile up, memory to climb and the process to be OOM-killed. Lack of timeouts, limits and a restart policy turned a slow dependency into a full outage.

### 4. How to Implement
**Prevent**
- Validate input; cap body size (`express.json({limit})`); rate limit; paginate (never return unbounded lists).
- Timeouts on every outbound call and DB query.
- Bounded pools/queues; backpressure (return `503` + `Retry-After` when overloaded).

**Contain**
- Circuit breaker for flaky dependencies (e.g. `opossum`); bulkheads (separate pools per dependency).
- Offload CPU work (workers/queues).

**Recover**
- Process manager / orchestrator restarts (PM2, systemd, Kubernetes).
- Graceful shutdown (finish in-flight requests).
- Health (`/livez`) and readiness (`/readyz`) endpoints; multiple replicas.
- Set memory limits (`--max-old-space-size`) below the container limit; alert on restarts.

### 5. Code Example
```js
process.on('unhandledRejection', (reason) => { logger.error({ reason }, 'unhandledRejection'); throw reason; });
process.on('uncaughtException', (err) => { logger.fatal({ err }); shutdown(1); });

const server = app.listen(3000);
let closing = false;
async function shutdown(code = 0) {
  if (closing) return; closing = true;
  server.close(async () => { await db.end(); await redis.quit(); process.exit(code); });
  setTimeout(() => process.exit(1), 10_000).unref();   // force after 10s
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

// reject early when overloaded
import toobusy from 'toobusy-js';
app.use((_req, res, next) => toobusy() ? res.status(503).set('Retry-After', '5').json({ error: 'busy' }) : next());

// outbound timeout
const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
```

### 6. Trade-offs
- Load shedding (503) hurts some users but protects everyone.
- Circuit breakers can return stale/fallback data — need product agreement.
- Restart-on-crash gives availability but can hide bugs; alert on crash-loops.

### 7. Common Mistakes
- Catching `uncaughtException` and continuing as if nothing happened.
- No timeouts → resources held forever.
- Unbounded queues/arrays/caches.
- Single instance, no health checks.
- Retrying without backoff (retry storms).

### 8. Interview Answer
"I use defence in depth. Prevention: input validation, body limits, rate limiting, pagination and timeouts on everything. Containment: circuit breakers, bounded pools and load shedding. Recovery: multiple replicas behind a load balancer, health/readiness probes, a supervisor that restarts crashed processes and graceful shutdown. Plus monitoring and alerts so I know before users do."

### 9. Follow-up Questions
- What does a graceful shutdown on Kubernetes need (preStop, terminationGracePeriod, readiness flip)?
- Liveness vs readiness probe?
- How do you design a circuit breaker's thresholds?
- What would you do if a single endpoint keeps taking the app down?

> Timeouts and retry details: [../11-production-and-deployment/timeouts-retries-logging.md](../11-production-and-deployment/timeouts-retries-logging.md)
