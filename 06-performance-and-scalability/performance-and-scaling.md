# Performance and Scalability

## Q1. How would you optimize a slow API?

### 1. Interview Question
"An endpoint takes 3 seconds. How do you find and fix the problem?"

### 2. Simple Explanation
**Measure first, then fix the biggest bottleneck.** Most slow APIs are slow because of the database or downstream calls, not JavaScript.

### 3. Real-World Scenario
`GET /orders` was 3 s. Tracing showed 1 query for orders + 1 query per order for items (N+1, 200 queries), no index on `user_id`, and a 4 MB response.

### 4. How to Implement
1. **Measure**: add timing/tracing (OpenTelemetry), look at p95/p99 not averages. Reproduce with `autocannon`/k6.
2. **Locate**: DB (`EXPLAIN ANALYZE`, slow query log) / external calls / CPU (`clinic flame`, `--cpu-prof`) / event loop lag / serialisation.
3. **Fix, in order of payoff**
   - DB: add indexes, remove N+1 (JOIN / `WHERE id = ANY($1)`), select only needed columns, paginate (keyset > offset).
   - Parallelise independent calls with `Promise.all` (bounded).
   - Cache hot reads (Redis / HTTP caching with ETag, `Cache-Control`).
   - Reduce payload: compression, field selection, pagination.
   - Move slow/non-essential work off the request path (queue).
   - CPU: workers, or cheaper algorithms.
4. **Verify** with the same load test; add a regression alert.

### 5. Code Example
```js
// Before: sequential + N+1
for (const o of orders) o.items = await db.query('SELECT * FROM items WHERE order_id=$1', [o.id]);

// After: one query + parallel independent calls
const [orders, profile] = await Promise.all([
  db.query('SELECT id,total,status FROM orders WHERE user_id=$1 ORDER BY id DESC LIMIT 50', [uid]),
  getProfile(uid),
]);
const { rows: items } = await db.query('SELECT * FROM items WHERE order_id = ANY($1)', [orders.rows.map(o => o.id)]);
const byOrder = Map.groupBy(items, i => i.order_id);   // Node 21+
orders.rows.forEach(o => (o.items = byOrder.get(o.id) ?? []));

// Keyset pagination
// SELECT ... WHERE id < $cursor ORDER BY id DESC LIMIT 50

// Compression + HTTP cache
import compression from 'compression';
app.use(compression());
res.set('Cache-Control', 'private, max-age=30');
```

### 6. Trade-offs
- Caching: big wins, but adds invalidation complexity and stale data.
- Indexes: faster reads, slower writes, more storage.
- Denormalisation: speed vs consistency.

### 7. Common Mistakes
- Guessing instead of profiling.
- Optimising JS when the DB is the bottleneck.
- Unbounded `Promise.all` that exhausts the DB pool.
- Offset pagination on huge tables.
- Caching without invalidation or TTL.

### 8. Interview Answer
"I start by measuring with tracing and percentiles to find where the time goes. Typically it's the database: N+1 queries, missing indexes or huge payloads, so I fix those, parallelise independent calls, add caching for hot data and push non-critical work to a queue. Then I re-run a load test to confirm the improvement."

### 9. Follow-up Questions
- How do you read an `EXPLAIN` plan?
- Why look at p99 instead of average?
- How do you find a CPU hotspot in Node (flamegraphs)?
- Offset vs keyset pagination?

---

## Q2. How do you handle high traffic and thousands of concurrent requests? (Horizontal vs Vertical scaling)

### 1. Interview Question
"Your API goes from 100 to 10,000 requests per second. What do you do?"

### 2. Simple Explanation
- **Vertical scaling**: bigger machine. Simple, but has a ceiling and is a single point of failure.
- **Horizontal scaling**: more machines/processes behind a load balancer. Requires **stateless** services.

```
Clients ─► CDN ─► Load Balancer ─► [Node x N] ─► Redis cache ─► DB primary
                                                          └──► DB read replicas
                              queue ─► workers (background)
```

### 3. Real-World Scenario
A ticket sale site: spikes 50× at launch. Static content on CDN, API stateless on autoscaling pods, sessions in Redis, reads on replicas, purchasing via queue with idempotency keys.

### 4. How to Implement
1. Make the app **stateless** (sessions/JWT, no local files, no in-memory counters).
2. Run one Node process per core (cluster/PM2/containers) behind a load balancer (Nginx/ALB).
3. Autoscale on CPU / event loop lag / request rate.
4. Cache: CDN for static/public, Redis for hot data.
5. DB: connection pooling, read replicas, indexes, later sharding.
6. Offload slow work to queues; protect with rate limiting and load shedding.
7. Load test to find the real limit (k6/autocannon); watch DB connections: `pods × pool size` must be less than DB max.

### 5. Code Example
```js
// stateless rate limit + session in Redis shared across instances
import { RedisStore } from 'rate-limit-redis';
import rateLimit from 'express-rate-limit';
app.use(rateLimit({ windowMs: 60_000, limit: 300, store: new RedisStore({ sendCommand: (...a) => redis.sendCommand(a) }) }));
```
```nginx
upstream api { least_conn; server app1:3000; server app2:3000; keepalive 64; }
```

### 6. Trade-offs
| | Vertical | Horizontal |
|---|---|---|
| Complexity | Low | Higher (LB, statelessness, distributed data) |
| Limit | Hardware max | Practically very high |
| Availability | SPOF | Redundant |
| Cost | Expensive at the top end | Linear, elastic |
Often: scale vertically first (cheap, quick), then go horizontal when you need availability or exceed limits.

### 7. Common Mistakes
- Local in-memory state (sessions, caches, rate limits) with multiple instances.
- Scaling app servers while the DB is the bottleneck.
- Too many pods × pool size exhausting DB connections.
- No load testing; scaling by guess.
- Sticky sessions as a crutch.

### 8. Interview Answer
"I make the service stateless, run multiple instances behind a load balancer with autoscaling, cache aggressively via CDN and Redis, scale the database with pooling, indexes and read replicas, and move slow work to queues. I'd start with vertical scaling for quick wins, but horizontal for resilience and growth, and I'd load test to find the real bottleneck, which is usually the database."

### 9. Follow-up Questions
- What makes a service stateless?
- How would you scale WebSockets?
- Which metric would you autoscale on?
- How do you avoid thundering herd on cache expiry?

---

## Q3. How do you manage the app's memory and avoid leaks?
See [../10-testing-and-debugging/debugging-memory-leaks.md](../10-testing-and-debugging/debugging-memory-leaks.md).
