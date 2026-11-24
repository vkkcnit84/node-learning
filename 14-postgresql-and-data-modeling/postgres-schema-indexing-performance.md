# PostgreSQL: Schema Design, Indexing and Query Performance

## Q1. How do you design a schema and choose indexes for a new domain (e.g. bookings / invoices)?

### 1. Interview Question
"Design the data model for a travel booking platform. How do you decide on tables, constraints and indexes?"

### 2. Simple Explanation
Model the **business facts** first (normalised, 3NF), enforce rules in the database (constraints), then add indexes **only for real query patterns**. Every index speeds reads but slows writes and costs disk/RAM.

- Primary keys: `bigint identity` or `uuid` (v7 is time-ordered, index-friendly; random v4 fragments B-trees).
- Money: `numeric(19,4)` or integer minor units + currency code. **Never `float`.**
- Time: `timestamptz`, always UTC.
- Integrity: `NOT NULL`, `FOREIGN KEY`, `CHECK`, `UNIQUE`; the DB is the last line of defence against bugs in any service.
- Flexible bits: `jsonb` for genuinely variable attributes, not as an excuse to skip modelling.

### 3. Real-World Scenario
`bookings(id, customer_id, status, total_amount, currency, created_at)` and `booking_items(...)`. Dashboards query "my bookings, newest first, filtered by status". Ops query "all PENDING older than 15 min" for a sweeper job.

### 4. How to Implement
1. List the top queries (WHERE / ORDER BY / JOIN) before indexing.
2. Composite index column order: **equality columns first, then range/sort**.
3. Use **partial indexes** for hot subsets and **covering indexes** (`INCLUDE`) to enable index-only scans.
4. Index every foreign key you join/delete on (Postgres does not do it automatically).
5. Use `GIN` for `jsonb` / full-text / arrays; `BRIN` for huge append-only time-series tables.
6. Add `CREATE INDEX CONCURRENTLY` for live tables.

### 5. Code Example
```sql
CREATE TABLE bookings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id   bigint NOT NULL REFERENCES customers(id),
  status        text   NOT NULL CHECK (status IN ('PENDING','CONFIRMED','CANCELLED')),
  total_amount  numeric(19,4) NOT NULL CHECK (total_amount >= 0),
  currency      char(3) NOT NULL,
  idempotency_key text UNIQUE,                    -- safe retries
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- "my bookings, newest first" (equality on customer_id, then sort)
CREATE INDEX CONCURRENTLY idx_bookings_customer_created
  ON bookings (customer_id, created_at DESC) INCLUDE (status, total_amount);

-- sweeper only cares about a tiny slice → small, fast partial index
CREATE INDEX CONCURRENTLY idx_bookings_pending
  ON bookings (created_at) WHERE status = 'PENDING';
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| Normalised | No anomalies, small writes | More joins |
| Denormalised column/table | Faster reads | Must keep in sync |
| More indexes | Faster reads | Slower writes, bloat, RAM |
| `uuid` v4 PK | Unguessable, merge-friendly | Index fragmentation; v7 fixes most |
| `jsonb` | Flexible | Weak constraints, harder to query/index |

### 7. Common Mistakes
- Indexing every column "just in case"; wrong composite order (`(created_at, customer_id)` can't serve the query above).
- `float` for money; `timestamp` without time zone.
- No FK indexes → slow deletes and joins.
- Using `OFFSET` pagination on large tables (see Q2).
- Building indexes without `CONCURRENTLY` in production (locks writes).

### 8. Interview Answer
"I start from the top queries and the business invariants. I normalise, push invariants into constraints, use `numeric` for money and `timestamptz` for time. Then I add composite indexes with equality columns first and the sort column last, use partial and covering indexes for hot paths, and always create them concurrently. I verify each index with `EXPLAIN ANALYZE` and drop unused ones using `pg_stat_user_indexes`."

### 9. Follow-up Questions
- B-tree vs GIN vs BRIN vs hash: when each?
- What is an index-only scan and why does `VACUUM` matter for it?
- How would you model multi-tenancy (schema per tenant vs `tenant_id` + row-level security)?
- How do you model a state machine (status transitions) safely?

---

## Q2. A query is slow in production. How do you diagnose and fix it?

### 1. Interview Question
"An endpoint that lists bookings went from 50 ms to 4 s. Walk me through your approach."

### 2. Simple Explanation
Don't guess. **Measure → read the plan → change one thing → re-measure.**

1. Find it: `pg_stat_statements` (top by total time), slow-query log, APM traces.
2. `EXPLAIN (ANALYZE, BUFFERS)`: compare *estimated* vs *actual* rows; look for `Seq Scan` on big tables, `Nested Loop` with huge loops, `Sort` spilling to disk, many `shared read` buffers.
3. Fix: missing/wrong index, stale statistics (`ANALYZE`), bad pagination, N+1 from the app, or too much data returned.

### 3. Real-World Scenario
`SELECT * FROM bookings WHERE customer_id = $1 ORDER BY created_at DESC OFFSET 50000 LIMIT 20` scanned and discarded 50,000 rows. Switching to **keyset pagination** brought it to 2 ms.

### 4. How to Implement
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, total_amount, created_at
FROM bookings
WHERE customer_id = 42
  AND (created_at, id) < ($1, $2)       -- keyset cursor
ORDER BY created_at DESC, id DESC
LIMIT 20;
```
Supporting index: `(customer_id, created_at DESC, id DESC)`.

App side (TypeScript, `pg`): select only needed columns, batch with `= ANY($1)` instead of N queries, set `statement_timeout`.

### 5. Code Example
```ts
// Eliminate N+1: one query for many parents
const { rows } = await pool.query(
  `SELECT booking_id, json_agg(i.*) AS items
     FROM booking_items i
    WHERE booking_id = ANY($1::bigint[])
    GROUP BY booking_id`,
  [bookingIds],
);
```

### 6. Trade-offs
| Technique | Good for | Cost |
|---|---|---|
| Add index | Selective filters | Write overhead |
| Keyset pagination | Deep paging, infinite scroll | No random page jump |
| Materialized view | Heavy aggregates | Staleness, refresh cost |
| Read replica | Read-heavy load | Replication lag |
| Cache (Redis) | Hot, repeated reads | Invalidation complexity |

### 7. Common Mistakes
- Tuning without `ANALYZE` (looking at estimates only).
- `SELECT *`; `OFFSET` for deep pages; functions on indexed columns (`WHERE lower(email)=…` needs an expression index).
- Ignoring table bloat / autovacuum; long-running transactions that block vacuum.
- Adding an index that the planner never uses (low selectivity).

### 8. Interview Answer
"I find the worst queries with `pg_stat_statements`, then run `EXPLAIN (ANALYZE, BUFFERS)` and compare estimated vs actual rows. Typical fixes are a composite or partial index matching the filter+sort, keyset pagination instead of OFFSET, killing N+1 in the app, and refreshing stats. I change one thing at a time and re-measure, and I add a statement timeout so one bad query can't take down the pool."

### 9. Follow-up Questions
- Why might the planner ignore your index?
- How do you spot lock contention (`pg_locks`, `pg_stat_activity`)?
- When do you partition a table?
- Read replicas: how do you handle read-your-writes?

---

## Q3. How do you change a live schema with zero downtime?

### 1. Interview Question
"How do you rename a column or add a NOT NULL column on a 200M-row table without downtime?"

### 2. Simple Explanation
Use the **expand → migrate → contract** pattern. Never ship a change that old and new app versions can't both survive (rolling deploys run both at once).

### 3. Real-World Scenario
Rename `bookings.price` → `total_amount` while 20 pods roll out.

### 4. How to Implement
1. **Expand**: add the new nullable column (fast, metadata-only).
2. **Dual-write**: app writes both; deploy.
3. **Backfill** in small batches (e.g. 5k rows, sleep between) to avoid long locks/replication lag.
4. **Switch reads** to the new column; deploy.
5. **Contract**: stop writing old, drop it in a later release.
6. Add constraints safely: `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT` (lighter lock).
7. Set `lock_timeout` so a migration fails fast instead of queueing behind long transactions and blocking everything.

### 5. Code Example
```sql
SET lock_timeout = '3s';
ALTER TABLE bookings ADD COLUMN total_amount numeric(19,4);          -- expand

-- backfill loop (run from a script, repeat until 0 rows)
UPDATE bookings SET total_amount = price
 WHERE id IN (SELECT id FROM bookings WHERE total_amount IS NULL LIMIT 5000);

ALTER TABLE bookings ADD CONSTRAINT total_nn CHECK (total_amount IS NOT NULL) NOT VALID;
ALTER TABLE bookings VALIDATE CONSTRAINT total_nn;                    -- no long exclusive lock
```

### 6. Trade-offs
| Approach | Pro | Con |
|---|---|---|
| Single big migration | Simple | Locks, downtime risk |
| Expand/contract | Safe, reversible | Several releases, temporary duplication |
| Online tools (pg-osc, pgroll) | Automated | Extra tooling to run/trust |

### 7. Common Mistakes
- `ALTER TABLE ... ADD COLUMN ... DEFAULT <volatile>` or type changes that rewrite the table.
- Backfilling in one giant transaction.
- Dropping a column the previous app version still reads.
- No rollback plan; migrations not tested against production-size data.

### 8. Interview Answer
"I use expand-and-contract: add the new column, dual-write, backfill in small batches, switch reads, then drop the old one in a later release. I set `lock_timeout`, use `NOT VALID` + `VALIDATE` for constraints, create indexes concurrently, and always make each step compatible with both the old and new application version."

### 9. Follow-up Questions
- How do you roll back a migration that already backfilled data?
- What operations rewrite a table in Postgres?
- How do you test migrations against production-like data?
- Transaction isolation levels: what anomalies does `READ COMMITTED` allow, and when do you need `SERIALIZABLE` or `SELECT ... FOR UPDATE`?
