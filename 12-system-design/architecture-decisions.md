# System Design: Architecture Decisions

## Q1. Monolith vs Microservices — which do you choose?

### 1. Interview Question
"Would you build this as a monolith or microservices?"

### 2. Simple Explanation
- **Monolith**: one deployable app (ideally a *modular* monolith with clear internal boundaries).
- **Microservices**: many small services, each owning its data and deployable independently, communicating over the network.

```
Monolith:        [ users | orders | payments | search ] ─► one DB
Microservices:   [users]─db  [orders]─db  [payments]─db   ◄─HTTP/queues─►
```

### 3. Real-World Scenario
A 4-person startup split into 12 microservices: most time went to deployment pipelines, distributed debugging and data consistency. Merging into a modular monolith doubled delivery speed. A 200-engineer company, conversely, needed independent deploys per team and scaled only the search service separately.

### 4. How to Implement the decision
1. Start with a **modular monolith**: clear module boundaries, no cross-module DB access, interfaces between modules.
2. Extract a service only for a concrete reason: independent scaling, different tech/runtime, team autonomy, fault isolation, compliance.
3. When splitting: own database per service, async messaging for non-critical flows, API gateway, tracing, idempotency, sagas/outbox for cross-service consistency.
4. Ensure CI/CD, observability and on-call maturity first.

### 5. Code Example (modular boundary in a monolith)
```js
// orders/index.js — the only thing other modules may import
export { createOrder, getOrder } from './service.js';
// payments module calls orders via its public interface, never its tables.
// Later, replacing this import with an HTTP/queue client lets you extract it with little change.
```
Event-based decoupling:
```js
await outbox.add({ type: 'OrderPlaced', orderId });   // written in same DB transaction as the order
// relay publishes to the queue → inventory/email services consume
```

### 6. Trade-offs
| | Monolith | Microservices |
|---|---|---|
| Dev speed (small team) | High | Slower |
| Deploy | All-or-nothing | Independent |
| Scaling | Whole app | Per service |
| Consistency | Easy ACID | Eventual, sagas |
| Ops complexity | Low | High (network, tracing, versioning) |
| Fault isolation | Weak | Better |

### 7. Common Mistakes
- Microservices too early, or "distributed monolith" (services share a DB / must deploy together).
- Wrong service boundaries (chatty calls).
- No observability or contract versioning.
- Sync call chains → cascading failures.

### 8. Interview Answer
"I default to a modular monolith because it's simpler to build, test and operate, and I split services only when there's a clear need such as independent scaling, team autonomy or fault isolation. If I split, each service owns its data, I prefer async messaging where possible, and I invest in tracing, retries, idempotency and an outbox for consistency."

### 9. Follow-up Questions
- What is the saga pattern? Outbox pattern?
- How do services communicate: REST vs gRPC vs messaging?
- API gateway role? Service discovery?
- How would you migrate monolith → microservices (strangler fig)?

---

## Q2. REST vs GraphQL

### 1. Interview Question
"When would you choose GraphQL over REST?"

### 2. Simple Explanation
REST: many resource URLs, server decides response shape, uses HTTP caching. GraphQL: one endpoint, the client asks for exactly the fields it needs, strongly typed schema.

### 3. Real-World Scenario
A mobile app's home screen needed data from 6 REST endpoints (slow on cellular, over-fetching). A GraphQL query returned everything in one round trip. Meanwhile, the public partner API stayed REST: simple, cacheable, easy to rate limit.

### 4. How to Implement the decision
1. Many different clients with varying data needs, deeply nested data → GraphQL (or BFF).
2. Simple CRUD, public APIs, heavy HTTP/CDN caching, file uploads, simple rate limiting → REST.
3. With GraphQL: use **DataLoader** (batching) against N+1, query depth/complexity limits, persisted queries, field-level authorisation.

### 5. Code Example
```js
// REST
app.get('/api/v1/users/:id', ...);               // GET → cacheable by CDN

// GraphQL (Apollo Server) with DataLoader
const loaders = () => ({ user: new DataLoader(async (ids) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = ANY($1)', [ids]);
  return ids.map(id => rows.find(r => r.id === id));
}) });
const resolvers = { Post: { author: (p, _a, ctx) => ctx.loaders.user.load(p.authorId) } };
```

### 6. Trade-offs
| | REST | GraphQL |
|---|---|---|
| Over/under-fetching | Common | Solved |
| Caching | Native HTTP/CDN | Harder (POST, per-field) |
| Rate limiting | Per route | Needs cost analysis |
| Complexity | Low | Schema, resolvers, N+1, security |
| Errors | HTTP status codes | Always 200 + `errors` array |
| Learning curve | Low | Higher |

### 7. Common Mistakes
- N+1 resolvers without DataLoader.
- Unbounded query depth (DoS); introspection open in production without thought.
- Treating GraphQL as a replacement for good API design.
- REST endpoints with no pagination/versioning.

### 8. Interview Answer
"REST is my default for simple, cache-friendly and public APIs. I choose GraphQL when there are multiple clients with different data needs or deeply connected data, where one query avoids many round trips. With GraphQL I add DataLoader, query complexity limits and field-level authorisation to avoid N+1 and abuse."

### 9. Follow-up Questions
- How do you cache GraphQL responses?
- gRPC vs REST for internal services?
- What is a BFF (Backend for Frontend)?
- How do you version REST vs GraphQL APIs?

---

## Q3. Design a high-traffic URL shortener / rate-limited public API (template answer)
1. **Clarify**: read/write ratio (e.g. 100:1), scale (10k RPS), latency target, availability.
2. **API**: `POST /links`, `GET /:code` (301/302).
3. **Data**: key-value (`code → url`), generate code via base62 of an ID/counter (avoid collisions).
4. **Read path**: CDN → Redis cache → DB (read replicas).
5. **Write path**: ID generator, validate URL (SSRF/malicious), write DB, async analytics via queue.
6. **Scale**: stateless Node pods + autoscaling, partition DB by code, TTL/expiry.
7. **Protect**: rate limits, abuse detection.
8. **Observe**: latency, cache hit ratio, error rate.
Use this structure (clarify → API → data → read/write path → scale → failure modes) for any design question.
