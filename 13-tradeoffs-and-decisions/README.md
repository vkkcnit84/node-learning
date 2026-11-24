# Trade-offs and Decisions Index

This file is an **index only**. Detailed answers (all 9 sections) live in the topic folders so nothing is duplicated. Below: a one-line decision rule plus a link to the full answer.

| Trade-off | One-line decision rule | Full answer |
|---|---|---|
| Process vs Thread | Process = isolated memory, safer; thread = shared memory, lighter | [01 Q1](../01-nodejs-fundamentals/node-architecture-and-processes.md) |
| Worker Threads vs Child Processes | Threads for CPU-bound JS; child processes for external binaries / isolation | [02 Q2](../02-event-loop-and-concurrency/concurrency-and-parallelism.md) |
| Cluster vs Worker Threads | Cluster scales request handling across cores; workers offload CPU from a request | [02 Q2](../02-event-loop-and-concurrency/concurrency-and-parallelism.md) |
| Synchronous vs Asynchronous | Sync only at startup/scripts; async in the request path | [02 Q3](../02-event-loop-and-concurrency/concurrency-and-parallelism.md) |
| Streams vs Buffer | Small data: buffer; large/unbounded: stream with `pipeline` | [05 Q2](../05-file-handling-and-streams/large-files-and-streams.md) |
| In-memory cache vs Redis | Local for tiny read-mostly data; Redis when shared/consistent across instances | [07 Q2](../07-database-and-caching/database-and-caching.md) |
| SQL vs NoSQL | Default to Postgres; NoSQL for flexible schema/huge scale/key access | [07 Q3](../07-database-and-caching/database-and-caching.md) |
| Horizontal vs Vertical scaling | Vertical first for speed; horizontal for availability and growth (needs stateless) | [06 Q2](../06-performance-and-scalability/performance-and-scaling.md) |
| JWT vs Sessions | JWT for stateless/scale; sessions for easy revocation | [08 Q1](../08-security/auth-and-rate-limiting.md) |
| Queue vs doing it inline | Anything slow/retryable/non-critical goes to a queue | [09 Q1](../09-background-jobs/background-jobs.md) |
| Monolith vs Microservices | Start modular monolith; split for a proven need | [12 Q1](../12-system-design/architecture-decisions.md) |
| REST vs GraphQL | REST default/public/cacheable; GraphQL for varied clients and nested data | [12 Q2](../12-system-design/architecture-decisions.md) |
| Big-bang rewrite vs Strangler | Strangler: route slice by slice, shadow-run, roll back instantly | [18 Q2](../18-monorepo-and-legacy-migration/monorepo-and-migration.md) |
| Monorepo vs Polyrepo | Monorepo for shared code/atomic changes, if you invest in caching + boundaries | [18 Q1](../18-monorepo-and-legacy-migration/monorepo-and-migration.md) |
| EKS vs ECS/Lambda | EKS for portability/ecosystem; ECS/Lambda when ops simplicity matters more | [17 Q1](../17-aws-and-kubernetes/aws-eks-sqs-ses.md) |
| SQS vs Kafka vs Redis queue | SQS for simple durable jobs; Kafka for replay/streams; Redis (BullMQ) for rich features | [17 Q2](../17-aws-and-kubernetes/aws-eks-sqs-ses.md) |
| pgvector vs dedicated vector DB | pgvector first; dedicated at large scale | [16 Q2](../16-ai-llm-engineering/llm-rag-agents.md) |
| Fixed workflow vs autonomous agent | Fixed when steps are known; agents only where flexibility pays for the risk | [16 Q3](../16-ai-llm-engineering/llm-rag-agents.md) |
| OFFSET vs keyset pagination | Keyset for deep/large lists | [14 Q2](../14-postgresql-and-data-modeling/postgres-schema-indexing-performance.md) |
| Rollback vs fix-forward | Rollback first to stabilise; fix forward once safe | [19 Q4](../19-leadership-and-ownership/mentoring-reviews-incidents.md) |

## How to answer any trade-off question (framework)
1. **Clarify the requirement** (scale, latency, team size, consistency, budget).
2. **State both options fairly** with their strengths.
3. **Pick one for this context** and say *why*.
4. **Name the downside you're accepting** and how you'd mitigate it.
5. **Say what would change your mind** ("if traffic grows 10×, I'd revisit…").
