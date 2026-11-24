# Node.js & Express.js: Scenario-Based Interview Preparation

Practical, production-focused preparation for Senior Node.js / Full Stack interviews. Every question uses the same 9-part format:

1. Interview Question → 2. Simple Explanation → 3. Real-World Scenario → 4. How to Implement → 5. Code Example → 6. Trade-offs → 7. Common Mistakes → 8. Interview Answer (speakable) → 9. Follow-up Questions

## Structure (and why)
One folder per **topic area**, so each concept has exactly **one home**. Trade-off questions are answered in their topic folder; [13-tradeoffs-and-decisions](13-tradeoffs-and-decisions/README.md) is only an index that links to them. This avoids duplicate content and keeps everything easy to extend.

## Learning roadmap
| # | Topic | Questions covered |
|---|---|---|
| 01 | [Node.js fundamentals](01-nodejs-fundamentals/node-architecture-and-processes.md) | Architecture, process vs thread, CJS vs ESM |
| 02 | [Event loop & concurrency](02-event-loop-and-concurrency/concurrency-and-parallelism.md) | Concurrent requests, Worker Threads vs Child Processes vs Cluster vs thread pool, sync vs async |
| 03 | [Express.js](03-expressjs/express-architecture-and-middleware.md) | Middleware pipeline, production app structure |
| 04 | [Error handling](04-error-handling/error-handling.md) | Error strategy, preventing crashes, graceful shutdown |
| 05 | [Files & streams](05-file-handling-and-streams/large-files-and-streams.md) | Large uploads, streams vs buffers, file streaming |
| 06 | [Performance & scalability](06-performance-and-scalability/performance-and-scaling.md) | Slow APIs, high traffic, horizontal vs vertical |
| 07 | [Database & caching](07-database-and-caching/database-and-caching.md) | Connection pooling, in-memory vs Redis, SQL vs NoSQL |
| 08 | [Security](08-security/auth-and-rate-limiting.md) | AuthN/AuthZ, rate limiting, security checklist |
| 09 | [Background jobs](09-background-jobs/background-jobs.md) | Queues, workers, retries, idempotency |
| 10 | [Testing & debugging](10-testing-and-debugging/debugging-memory-leaks.md) | Memory leaks, testing Express APIs |
| 11 | [Production & deployment](11-production-and-deployment/timeouts-retries-logging.md) | Timeouts/retries, logging, monitoring |
| 12 | [System design](12-system-design/architecture-decisions.md) | Monolith vs microservices, REST vs GraphQL, design template |
| 13 | [Trade-offs index](13-tradeoffs-and-decisions/README.md) | Central index + framework for decision questions |
| 14 | [PostgreSQL & data modelling](14-postgresql-and-data-modeling/postgres-schema-indexing-performance.md) | Schema + indexing, slow-query diagnosis, zero-downtime migrations |
| 15 | [TypeScript](15-typescript/typescript-in-production.md) | Runtime validation (Zod), strict config, service structure |
| 16 | [AI / LLM engineering](16-ai-llm-engineering/llm-rag-agents.md) | LLM integration, RAG, agentic workflows, AI-assisted dev & review |
| 17 | [AWS & Kubernetes](17-aws-and-kubernetes/aws-eks-sqs-ses.md) | EKS + ALB deploys, SQS consumers, SES email |
| 18 | [Monorepo & legacy migration](18-monorepo-and-legacy-migration/monorepo-and-migration.md) | pnpm + Turborepo, strangler fig, MongoDB → Postgres |
| 19 | [Leadership & ownership](19-leadership-and-ownership/mentoring-reviews-incidents.md) | ADRs, code review, mentoring, incidents/observability, startup practices |

## Runnable playground
Every scenario above is also a live endpoint in [playground/](playground/README.md): run `npm start` there, open http://localhost:3000, or see the full list in [playground/ENDPOINTS.md](playground/ENDPOINTS.md). Click-to-run requests are in [playground/requests.http](playground/requests.http).

## Suggested study order
1. **Foundations:** 01 → 02 → 03
2. **Reliability:** 04 → 05 → 11
3. **Scale & data:** 06 → 07 → 09
4. **Safety & quality:** 08 → 10
5. **Senior-level reasoning:** 12 → 13 (revisit the trade-offs index often)
6. **Senior/Staff JD topics:** 14 → 15 → 17 → 18 → 16 → 19 (data, types, cloud, migration, AI, leadership)

## Question checklist (from your goals)
- [x] Large file upload/processing → 05
- [x] Error handling → 04
- [x] Child process / worker thread / thread pool → 02
- [x] Concurrent requests → 02
- [x] Preventing crashes → 04
- [x] High traffic → 06
- [x] Slow API optimisation → 06
- [x] DB connection pooling → 07
- [x] Rate limiting → 08
- [x] Memory leaks → 10
- [x] Background jobs → 09
- [x] AuthN / AuthZ → 08
- [x] Timeouts and retries → 11
- [x] File streaming → 05
- [x] Logging and monitoring → 11
- [x] All 10 trade-off pairs → 13
- [x] PostgreSQL schema/indexing/perf → 14
- [x] TypeScript → 15
- [x] LLM / RAG / agents / AI-assisted dev → 16
- [x] AWS EKS / ALB / SQS / SES → 17
- [x] Monorepo (pnpm/Turborepo), legacy replacement, MongoDB migration → 18
- [x] Mentoring, code review, ADRs, incidents, startup practices → 19

## How to use this
- Read the **Simple Explanation** and **Interview Answer** first, then the scenario and code.
- Say the interview answer out loud; then try the follow-ups without looking.
- Add new questions to the right topic folder using the same 9-part template, and link them from this README (and the trade-offs index if it's a comparison).

## Ideas for next questions
WebSockets/real-time scaling, pagination & API design, idempotency & payments, file/image CDN pipelines, multi-tenancy, API versioning, GraphQL deep-dive, caching strategies in depth, event-driven architecture (Kafka), travel/fintech domain design (booking, ledger, double-entry accounting), Postgres transactions & locking.
