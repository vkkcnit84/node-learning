# Databases and Caching

## Q1. How do you handle database connection pooling?

### 1. Interview Question
"Why do we use connection pools, and how do you size and configure one?"

### 2. Simple Explanation
Opening a DB connection is expensive (TCP + TLS + auth, ~20–100 ms) and databases allow only limited connections. A **pool** keeps N connections open and lends them out per query.

```
requests ─► [pool: 10 connections] ─► Postgres (max_connections=100)
 request 11 waits in pool queue until a connection is free (or times out)
```

### 3. Real-World Scenario
Autoscaling went from 4 to 40 pods, each with `max: 20` → 800 connections against a DB limited to 200. The DB refused connections and everything failed. Fix: smaller per-pod pool + PgBouncer.

### 4. How to Implement
1. Create **one pool per process** at startup; reuse everywhere (never per request).
2. Size: `pool.max × instances ≤ DB max_connections` (leave headroom for admin/migrations). Start small (5–20); more connections ≠ more throughput.
3. Set `connectionTimeoutMillis`, `idleTimeoutMillis`, `statement_timeout`.
4. Use `pool.query()` for single queries; `connect()` + `release()` in `finally` for transactions.
5. Handle pool `'error'` events; expose pool stats as metrics.
6. Use PgBouncer (transaction mode) when many instances/serverless.

### 5. Code Example
```js
import pg from 'pg';
export const pool = new pg.Pool({
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,      // fail fast if pool exhausted
  statement_timeout: 5_000,
});
pool.on('error', (err) => logger.error({ err }, 'idle client error'));

export async function transfer(from, to, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE accounts SET bal = bal - $1 WHERE id=$2 AND bal >= $1', [amount, from]);
    await client.query('UPDATE accounts SET bal = bal + $1 WHERE id=$2', [amount, to]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();                  // ALWAYS
  }
}
```

### 6. Trade-offs
- Bigger pool: more parallelism, but DB contention and memory; diminishing returns beyond ~2× cores of the DB.
- Smaller pool: protects DB, requests queue under load (set timeouts).
- External pooler: scales connection count, but transaction mode breaks session features (prepared statements, `SET`, advisory locks).

### 7. Common Mistakes
- Creating a new client/pool per request.
- Forgetting `client.release()` (connection leak → pool exhausted → hangs).
- Holding a connection during slow non-DB work (HTTP calls inside a transaction).
- Not accounting for instance count.
- No timeouts.

### 8. Interview Answer
"A pool reuses a limited set of open connections. I create one pool per process, size it so that instances times max stays under the database limit, set connection and statement timeouts, and always release connections in `finally`. For many instances or serverless I add PgBouncer. Leaks and per-request pools are the classic mistakes."

### 9. Follow-up Questions
- What happens when the pool is exhausted?
- How do you detect connection leaks?
- Why not set the pool to 500?
- Pool settings for MongoDB / Prisma / Sequelize?

---

## Q2. In-memory cache vs Redis — what do you choose?

### 1. Interview Question
"Where would you cache data in a Node API: in process memory or Redis?"

### 2. Simple Explanation
In-memory (a `Map`/LRU) lives inside one Node process: fastest, but each instance has its own copy and loses it on restart. Redis is a shared external cache: slower (network hop ~0.5–1 ms) but consistent across instances and survives deploys.

### 3. Real-World Scenario
Product catalogue (rarely changes, same for everyone): in-memory LRU with 60 s TTL. User sessions, rate limits, and expensive per-user dashboards across 10 pods: Redis.

### 4. How to Implement (cache-aside)
1. Check cache → hit: return.
2. Miss: load from DB, store with **TTL**, return.
3. On write: update DB then **invalidate** (delete) the key.
4. Protect against stampede: request coalescing/locking, jittered TTL.
5. Two-tier: tiny local LRU in front of Redis for hottest keys.

### 5. Code Example
```js
import { LRUCache } from 'lru-cache';
const local = new LRUCache({ max: 1000, ttl: 10_000 });

export async function getProduct(id) {
  const key = `product:${id}`;
  const l = local.get(key); if (l) return l;

  const cached = await redis.get(key);
  if (cached) { const v = JSON.parse(cached); local.set(key, v); return v; }

  const row = await inflight(key, () => db.findProduct(id));       // coalesce concurrent misses
  await redis.set(key, JSON.stringify(row), 'EX', 300 + Math.floor(Math.random() * 60)); // jitter
  local.set(key, row);
  return row;
}
const flights = new Map();
const inflight = (k, fn) => flights.get(k) ?? (flights.set(k, fn().finally(() => flights.delete(k))), flights.get(k));

export async function updateProduct(id, data) {
  await db.update(id, data);
  await redis.del(`product:${id}`);   // invalidate
}
```

### 6. Trade-offs
| | In-memory | Redis |
|---|---|---|
| Latency | ~µs | ~ms |
| Shared between instances | No | Yes |
| Survives restart | No | Yes (optionally persistent) |
| Memory | Competes with app heap/GC | Separate |
| Consistency | Each instance may differ | Single source |
| Extra infra | None | Yes (and a new failure point) |

### 7. Common Mistakes
- Caching without TTL or invalidation.
- Unbounded in-memory `Map` → memory leak.
- Per-instance counters for rate limiting.
- Cache stampede on expiry; caching `null`/errors forever.
- Treating Redis as always available (no fallback/timeouts).
- Caching user-specific data under a shared key (data leak).

### 8. Interview Answer
"In-memory caching is fastest and simplest but is per-instance and lost on restart, so I use it for small, read-mostly data that tolerates brief inconsistency. Redis is shared and survives deployments, so I use it for sessions, rate limiting and data that must be consistent across instances. Often I combine both: a small LRU in front of Redis, with TTLs, cache-aside and explicit invalidation."

### 9. Follow-up Questions
- Cache-aside vs write-through vs write-behind?
- How do you avoid cache stampede / thundering herd?
- Redis eviction policies?
- What if Redis goes down?

---

## Q3. SQL vs NoSQL — how do you choose?

### 1. Interview Question
"Would you use PostgreSQL or MongoDB for this system, and why?"

### 2. Simple Explanation
SQL: structured tables, relations, ACID transactions, powerful joins. NoSQL (document/key-value/wide-column/graph): flexible schema, built for horizontal scaling and specific access patterns.

### 3. Real-World Scenario
- E-commerce orders/payments/inventory: relational, transactional → PostgreSQL.
- Activity feed / event logs / product catalogue with varying attributes → MongoDB/DynamoDB.
- Often both: Postgres as source of truth + Redis/Elasticsearch for specialised needs.

### 4. How to Implement the decision
1. List access patterns and consistency needs.
2. Strong relations + transactions + reporting → SQL.
3. Massive write volume, simple key access, flexible/evolving documents, easy sharding → NoSQL.
4. Default to Postgres unless there's a specific reason (it also supports JSONB).
5. Validate with data volume and team expertise.

### 5. Code Example
```js
// SQL: join + transaction safety
const { rows } = await pool.query(
  `SELECT o.id, o.total, json_agg(i.*) AS items
   FROM orders o JOIN order_items i ON i.order_id = o.id
   WHERE o.user_id = $1 GROUP BY o.id`, [uid]);

// Document: embed what you read together
await db.collection('orders').insertOne({ userId, items: [{ sku, qty, price }], total, createdAt: new Date() });
```

### 6. Trade-offs
| | SQL | NoSQL |
|---|---|---|
| Schema | Strict, migrations | Flexible |
| Transactions/joins | Strong | Limited/varies |
| Scaling | Vertical + replicas (sharding harder) | Horizontal natively |
| Query flexibility | Ad-hoc queries | Design around access patterns |
| Risks | Rigid schema changes | Data duplication, weaker consistency |

### 7. Common Mistakes
- "NoSQL is faster/scales better" as a blanket claim.
- Choosing NoSQL then needing joins/transactions.
- Normalising everything in a document DB (or embedding unbounded arrays).
- Ignoring indexes in both.

### 8. Interview Answer
"I choose based on data shape and access patterns. If data is relational and needs transactions and flexible querying, I pick SQL, usually PostgreSQL. If I need a flexible schema, very high write throughput or simple key-based access at huge scale, NoSQL fits. I'd default to Postgres and add specialised stores only for a proven need."

### 9. Follow-up Questions
- ACID vs BASE? CAP theorem?
- How do you do transactions in MongoDB?
- When would you shard?
- Indexing strategies (composite, covering)?
