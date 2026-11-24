# Monorepos and Legacy Migration

## Q1. How do you structure a TypeScript monorepo with pnpm workspaces and Turborepo?

### 1. Interview Question
"We have an API, a worker, a web app and shared libraries. Why and how would you use a monorepo?"

### 2. Simple Explanation
One repo, many packages. **pnpm workspaces** link local packages and share one strict, disk-efficient `node_modules`. **Turborepo** builds a task graph (`build`, `test`, `lint`) from package dependencies, runs tasks in parallel, and **caches** results (local/remote) so unchanged packages are skipped.

### 3. Real-World Scenario
A shared `@acme/types` change must update API and worker together. In separate repos that's 3 PRs and version bumps; in a monorepo it's one atomic PR and CI only rebuilds affected packages.

### 4. How to Implement
```
apps/        api/  worker/  web/
packages/    db/  config/  contracts/ (zod schemas)  eslint-config/  tsconfig/
pnpm-workspace.yaml   turbo.json   package.json
```
1. Internal packages reference each other with `"@acme/db": "workspace:*"`.
2. Shared `tsconfig` base + ESLint config packages; TypeScript **project references** or build-then-consume.
3. `turbo.json` pipelines with `dependsOn: ["^build"]`, declare `outputs` for caching.
4. CI: `turbo run build test lint --filter=...[origin/main]` (affected only) + remote cache.
5. Versioning: Changesets if publishing; otherwise single version, deploy per app.
6. Ownership: `CODEOWNERS`, enforce package boundaries (lint rule/`eslint-plugin-boundaries`), no circular deps.
7. Docker per app using `turbo prune --docker` for small, cache-friendly images.

### 5. Code Example
```yaml
# pnpm-workspace.yaml
packages: ["apps/*", "packages/*"]
```
```jsonc
// turbo.json
{ "tasks": {
  "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
  "test":  { "dependsOn": ["build"], "outputs": [] },
  "lint":  {},
  "dev":   { "cache": false, "persistent": true } } }
```
```bash
pnpm --filter @acme/api... build         # api and everything it depends on
pnpm turbo run test --filter=...[origin/main]
```

### 6. Trade-offs
| | Monorepo | Polyrepo |
|---|---|---|
| Cross-package change | One atomic PR | Many PRs, version coordination |
| Code sharing | Trivial | Publish/consume packages |
| Tooling/CI | Needs caching/affected builds | Simple per repo |
| Access control | Coarser | Per-repo |
| Risk | Slow CI, tangled boundaries without discipline | Drift, duplication |

Alternatives: Nx (more features, heavier), Lerna (mostly replaced), plain npm/yarn workspaces.

### 7. Common Mistakes
- No enforced boundaries → big ball of mud; circular dependencies.
- Missing `outputs`/inputs in Turbo → cache misses or stale cache hits.
- Every package having its own conflicting TS/ESLint config.
- Running full CI for every change (no `--filter`/caching); phantom dependencies (pnpm's strictness exposes them, fix rather than hoist).

### 8. Interview Answer
"I'd use pnpm workspaces for linking and strict dependency resolution, and Turborepo for a cached, dependency-aware task graph. Apps live in `apps/`, shared libs like db, contracts and configs in `packages/`. CI runs only affected packages with a remote cache, boundaries are enforced by lint rules and CODEOWNERS, and each app gets its own pruned Docker image. The payoff is atomic cross-package changes; the cost is needing discipline on boundaries and CI speed."

### 9. Follow-up Questions
- How does Turbo decide a cache hit?
- How do you share a Zod contract between API and frontend?
- How do you deploy only the services that changed?
- When would you NOT use a monorepo?

---

## Q2. How do you replace or run alongside a legacy system (strangler fig)?

### 1. Interview Question
"We have a legacy monolith that makes money but is hard to change. How do you modernise it without a big-bang rewrite?"

### 2. Simple Explanation
**Strangler fig**: put a routing layer in front, move one capability at a time to the new system, and retire the old one slice by slice. Big-bang rewrites fail because the old system keeps changing, the new one reaches parity late, and cut-over is high risk.

### 3. Real-World Scenario
Legacy PHP/MongoDB app handles bookings. You rebuild "invoices" in Node/Postgres first: low-risk, well-bounded, clear value.

### 4. How to Implement
1. **Characterise** the legacy: map domains, data ownership, integrations; write **characterisation tests** around current behaviour.
2. Add a **facade/proxy** (ALB rules, API gateway, or a Node BFF) routing by path/feature flag/tenant.
3. Pick a slice with clear boundaries; build it in the new system behind a flag.
4. **Shadow/dual-run**: send traffic to both, compare responses (log diffs), serve the legacy answer until diffs are ~0.
5. **Data**: choose one source of truth per entity; sync with CDC/events or dual-write + reconciliation (see Q3); use an anti-corruption layer to translate legacy models.
6. **Gradual rollout**: 1% → 10% → 100% by tenant/percentage with instant rollback.
7. Decommission: once a slice has no traffic, delete code and data paths; track progress visibly.

### 5. Code Example
```ts
// Routing facade: per-route + per-tenant rollout
app.use('/api/invoices', async (req, res, next) => {
  const useNew = flags.isOn('invoices-new', { tenant: req.tenantId });   // percentage/tenant based
  if (!useNew) return proxyToLegacy(req, res);
  if (flags.isOn('invoices-shadow')) shadowCompare(req);                 // fire-and-forget diff
  return next();                                                         // new implementation
});
```

### 6. Trade-offs
| Approach | Pro | Con |
|---|---|---|
| Big-bang rewrite | Clean slate | Long, risky, feature freeze, often fails |
| Strangler | Incremental value, rollback | Two systems for a long time, sync complexity |
| Leave & wrap (anti-corruption) | Cheapest | Legacy keeps costing |
| Dual-write | Simple | Inconsistency risk without reconciliation |
| CDC (Debezium) | Reliable, decoupled | Infra to run |

### 7. Common Mistakes
- Rewriting everything at once; copying the legacy design bug-for-bug.
- Two writers for one entity with no ownership; no reconciliation job.
- No rollback path; no metrics to compare old vs new.
- Migrating the hardest, most coupled part first.

### 8. Interview Answer
"I avoid big-bang rewrites. I put a facade in front, pick a well-bounded slice, build it in the new stack behind a flag, shadow-run it against legacy to compare outputs, then roll out by tenant or percentage with instant rollback. Each entity has one source of truth, synced by events or CDC with reconciliation, and an anti-corruption layer protects the new model. I measure progress and delete legacy code as slices drain."

### 9. Follow-up Questions
- How do you choose the first slice?
- How do you keep data consistent during the transition?
- How do you handle features still being added to legacy?
- How do you get buy-in and measure success?

---

## Q3. How do you migrate data from MongoDB to PostgreSQL and prove it's correct?

### 1. Interview Question
"Migrate 50M booking documents from MongoDB to Postgres with no data loss. How do you validate it?"

### 2. Simple Explanation
Treat it as **ETL + continuous validation**. Mongo is schema-less, so real data has surprises (missing fields, mixed types, orphan references, duplicates). Design the relational model first, migrate in repeatable idempotent batches, and **verify with counts, checksums and sampled field-level diffs** before cutting over.

### 3. Real-World Scenario
`price` is a number in most docs, a string `"12.50"` in some, and missing in others. A naive import fails or silently corrupts totals.

### 4. How to Implement
1. **Profile** the source (field presence, types, cardinality, orphans); document a mapping spec.
2. Design target schema + constraints; unmappable data goes to a **quarantine table** with reason, not silently dropped.
3. **Idempotent batch ETL**: stream by `_id` ranges (cursor, resumable), transform + Zod-validate each doc, `INSERT ... ON CONFLICT DO UPDATE` (upsert) keyed by the Mongo `_id` stored as `legacy_id`.
4. **Initial load + incremental sync** (change streams/oplog or `updatedAt` watermark) until cut-over.
5. **Validate**: row counts per collection/partition, sum/aggregate checks (e.g. total revenue per day), per-row hash comparison, random sample deep diff, FK/orphan checks, and business-rule checks. Produce a report; gate cut-over on thresholds.
6. **Cut-over**: freeze or drain writes briefly, final delta sync, switch reads (shadow reads first), keep Mongo read-only as fallback for a period.
7. Performance: bulk `COPY` for initial load, disable/defer indexes then rebuild, batch size tuning, run in parallel by range.

### 5. Code Example
```ts
import { MongoClient, ObjectId } from 'mongodb';
import { z } from 'zod';

const Doc = z.object({
  _id: z.instanceof(ObjectId),
  customerId: z.string(),
  price: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().nonnegative()),
  createdAt: z.coerce.date(),
});

let last: ObjectId | null = await checkpoint.load();
for (;;) {
  const batch = await col.find(last ? { _id: { $gt: last } } : {}).sort({ _id: 1 }).limit(5000).toArray();
  if (!batch.length) break;
  const ok: z.infer<typeof Doc>[] = [];
  for (const raw of batch) {
    const r = Doc.safeParse(raw);
    r.success ? ok.push(r.data) : await quarantine.add(raw._id, r.error.message);
  }
  await upsertBookings(ok);                    // INSERT ... ON CONFLICT (legacy_id) DO UPDATE
  last = batch.at(-1)!._id; await checkpoint.save(last);
}
```
```sql
-- reconciliation example
SELECT date_trunc('day', created_at) d, count(*), sum(total_amount) FROM bookings GROUP BY 1;
-- compare with the same aggregate computed from Mongo
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| One-time dump & switch | Simple | Downtime, no fallback |
| Incremental sync + cut-over | Minimal downtime | Needs change capture, complexity |
| Keep JSON in `jsonb` | Fast migration | Defers modelling, poor constraints |
| Fully relational | Integrity, query power | More mapping work |

### 7. Common Mistakes
- Not profiling first; silently dropping bad docs; non-idempotent loads (can't re-run).
- Validating only row counts (equal counts can hide wrong values).
- Timezone/decimal/ObjectId→UUID mistakes; forgetting soft-deleted data.
- No fallback/rollback plan; cutting over without shadow reads.

### 8. Interview Answer
"I profile the source first, design the relational target, then run an idempotent, resumable batch ETL that validates each document with a schema and quarantines failures with reasons. I sync deltas until cut-over, then prove correctness with counts, aggregate checksums, per-row hashes and sampled deep diffs, gating the switch on those results. I shadow-read first, keep Mongo read-only as a fallback, and cut over with a final delta sync."

### 9. Follow-up Questions
- How do you keep data in sync during the migration window?
- How would you validate 50M rows efficiently?
- How do you map Mongo embedded arrays and references to tables?
- What did you do about data that fails validation?
