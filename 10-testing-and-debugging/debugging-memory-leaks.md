# Debugging: Memory Leaks

## Q1. How do you find and fix a memory leak in a Node.js service?

### 1. Interview Question
"Your service's memory grows steadily until it's OOM-killed every few hours. What do you do?"

### 2. Simple Explanation
A leak = objects you no longer need are still **reachable**, so the garbage collector can't free them. Heap usage keeps climbing (sawtooth pattern with a rising baseline).

### 3. Real-World Scenario
A chat API cached user profiles in a module-level `Map` with no eviction, and added a new `process.on('message')`/`emitter.on` listener on every request. After 6 hours: 1.5 GB heap, restarts every night.

### 4. How to Implement (investigation steps)
1. **Confirm**: chart `process.memoryUsage().heapUsed` / RSS over time; compare after forced GC (`--expose-gc`). Heap grows = JS leak; RSS grows but heap flat = Buffers/native.
2. **Reproduce** under load (autocannon) in staging.
3. **Capture heap snapshots**: take #1 after warm-up, run load, take #2, #3 (Chrome DevTools via `node --inspect`, or `v8.writeHeapSnapshot()` in prod behind a protected route/signal).
4. **Compare snapshots**: sort by "Delta"/retained size; find classes with growing counts, inspect the retainer path.
5. Fix the cause, redeploy, verify the graph is flat.
6. Safety net: `--max-old-space-size` below container limit, alerts, rolling restarts.

### 5. Code Example
```js
// Typical leaks and fixes
const cache = new Map();                       // LEAK: unbounded
app.get('/user/:id', async (req, res) => {
  if (!cache.has(req.params.id)) cache.set(req.params.id, await load(req.params.id));
  res.json(cache.get(req.params.id));
});
// FIX
import { LRUCache } from 'lru-cache';
const cache2 = new LRUCache({ max: 5000, ttl: 60_000 });

// LEAK: listener added per request
app.get('/stream', (req, res) => { bus.on('update', d => res.write(d)); });
// FIX: remove on close
app.get('/stream', (req, res) => {
  const h = d => res.write(d);
  bus.on('update', h);
  req.on('close', () => bus.off('update', h));
});

// Take a snapshot on demand
import v8 from 'node:v8';
process.on('SIGUSR2', () => console.log('snapshot', v8.writeHeapSnapshot()));

// Monitor
setInterval(() => {
  const m = process.memoryUsage();
  logger.info({ heapMB: m.heapUsed / 1048576, rssMB: m.rss / 1048576 });
}, 30_000).unref();
```

### 6. Trade-offs
- Heap snapshots pause the process and are large; use on one instance (drain it from the LB first).
- Restart-as-a-fix keeps you alive but hides the bug; use only as a mitigation.
- Weak references (`WeakMap`/`WeakRef`) avoid some leaks but make caching semantics unpredictable.

### 7. Common Mistakes
- Unbounded module-level caches/arrays/maps.
- Event listeners/timers/intervals never removed (MaxListenersExceededWarning is a hint!).
- Closures capturing large objects; global variables.
- Unconsumed streams / unclosed DB cursors and connections.
- Logging full request objects into in-memory buffers.
- Confusing normal GC growth with a leak (look at the trend after GC).

### 8. Interview Answer
"First I confirm it's a leak by watching heap after GC over time. Then I reproduce it under load, take heap snapshots at intervals in DevTools and compare them to see which objects grow and what retains them. Common culprits are unbounded caches, listeners never removed and timers or closures holding references. I fix it, for example with an LRU cache with TTL, verify memory is flat, and keep memory alerts and limits as a safety net."

### 9. Follow-up Questions
- How does V8's generational GC work (young/old space)?
- What is heap vs RSS vs external memory?
- How do you debug a leak in production safely?
- Tools: `clinic heapprofiler`, `heapdump`, `--heap-prof`, `memlab`?

---

## Q2. How do you test an Express API?

### 1. Interview Question
"How do you test an Express app: unit, integration, and what do you mock?"

### 2. Simple Explanation
Testing pyramid: many fast **unit** tests (services, pure logic), fewer **integration** tests (HTTP → DB with a real test database), a few **end-to-end** tests. Export `app` without `listen` so tests can call it in-process via **supertest**.

### 3. Real-World Scenario
A refactor of the discount logic silently broke the order total. A unit test on the pricing service plus an integration test for `POST /orders` would have caught it in CI.

### 4. How to Implement
1. Separate `app.js` and `server.js`.
2. Unit test services with mocked repositories/clients.
3. Integration test with supertest against a real DB (Docker/Testcontainers), reset data per test/transaction.
4. Mock only external boundaries (payment, email) — not your own DB.
5. Test error paths (400/401/403/404/409/500), not just happy paths.
6. Run in CI; use Node's built-in test runner or Vitest/Jest.

### 5. Code Example
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';

test('POST /orders rejects invalid qty', async () => {
  const res = await request(app).post('/api/v1/orders')
    .set('Authorization', `Bearer ${token}`).send({ sku: 'A1', qty: -1 });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'VALIDATION');
});

test('GET /invoices/:id enforces tenant isolation', async () => {
  const res = await request(app).get(`/api/v1/invoices/${otherTenantInvoiceId}`)
    .set('Authorization', `Bearer ${tokenForTenantA}`);
  assert.equal(res.status, 404);
});
```

### 6. Trade-offs
- Mock-heavy tests: fast but may not reflect reality. Real-DB integration tests: slower but trustworthy.
- High coverage numbers ≠ good tests; focus on behaviour and risky paths.

### 7. Common Mistakes
- Calling `app.listen` in tests (port conflicts).
- Shared state between tests; test order dependence.
- Mocking everything including the thing under test.
- Only testing the happy path; no auth/authorisation tests.

### 8. Interview Answer
"I split `app` from `server` so I can use supertest. Business logic gets unit tests with mocked boundaries; the HTTP layer gets integration tests against a real test database, including auth, validation and error cases. I mock only external services and run everything in CI."

### 9. Follow-up Questions
- How do you test code that uses time/randomness?
- Contract testing between services?
- How do you test queues/workers?
- Load testing vs functional testing?
