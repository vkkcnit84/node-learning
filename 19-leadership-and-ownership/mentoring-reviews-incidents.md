# Senior / Staff Behaviours: Decisions, Reviews, Mentoring, Incidents, Observability

Senior interviews test judgement and ownership as much as syntax. Use the **STAR** shape for stories (Situation, Task, Action, Result) and add **what you'd do differently**.

## Q1. How do you make and document architecture decisions with incomplete requirements?

### 1. Interview Question
"Requirements are vague and the deadline is fixed. How do you decide, and how do you defend it later?"

### 2. Simple Explanation
Reduce ambiguity cheaply, decide with the best info available, make the decision **reversible where possible**, write it down, and say what would change your mind.

### 3. Real-World Scenario
Product wants "notifications" with no volume, channel or SLA. Options: in-process emitter, SQS + workers, or a third-party service.

### 4. How to Implement
1. **Clarify** what's cheap to ask (users, volume, latency, consistency, budget, team skills). List assumptions explicitly.
2. **Generate 2–3 real alternatives** including "do nothing/simple".
3. Evaluate vs. criteria; separate **one-way doors** (hard to undo: data model, public API) from **two-way doors** (internal impl.). Spend rigour on the former.
4. Pick, **escalate with a recommendation + rationale + risks** (never just a question).
5. Record an **ADR**; review with peers; schedule a revisit trigger.

### 5. Code Example
```md
# ADR-014: Use SQS + worker for notifications
Status: Accepted (2026-11-24)   Deciders: backend team
## Context
Volume unknown (est. 10–100k/day), must not block checkout, retries needed.
## Options
1. In-process EventEmitter: simplest; loses events on crash. Rejected.
2. SQS + worker (chosen): durable, retries, DLQ; team knows AWS.
3. Third-party notification platform: fastest; cost + data-residency concerns. Revisit >1M/day.
## Decision / Consequences
Idempotent consumers required; +1 deployable; alarms on DLQ.
## Revisit when
Volume >1M/day or need for user-level preferences/templates UI.
```

### 6. Trade-offs
| Approach | Pro | Con |
|---|---|---|
| Decide fast, reversible | Speed, learning | May need rework |
| Analyse deeply first | Fewer mistakes | Delay, analysis paralysis |
| Consensus | Buy-in | Slow, lowest-common-denominator |
| Decide-and-disclose (with ADR) | Speed + accountability | Needs trust, good docs |

### 7. Common Mistakes
- Presenting one option as if it were the only one; no rejected alternatives recorded.
- Over-engineering for imagined scale; treating every decision as irreversible.
- Escalating with "what should I do?" instead of a recommendation.

### 8. Interview Answer
"I ask the few questions that most reduce risk, write down my assumptions, and compare two or three real options including the simple one. I treat one-way doors carefully and two-way doors quickly. I then decide, document it as an ADR with rejected alternatives and a revisit trigger, and if I need to escalate I bring a recommendation with rationale and risks."

### 9. Follow-up Questions
- Tell me about a decision you got wrong. What did you learn?
- How do you handle disagreement with another senior engineer?
- How do you balance tech debt with feature delivery?

---

## Q2. What does a substantive code review look like?

### 1. Interview Question
"How do you review a pull request? What do you look for beyond style?"

### 2. Simple Explanation
Automate style (lint/format/types/CI). Humans review **design, correctness, risk and maintainability**, in a tone that teaches.

### 3. Real-World Scenario
A PR adds `POST /refunds`. It's clean and tested but has no idempotency key, checks authorisation by a body field, and does an HTTP call to the payment provider inside a DB transaction.

### 4. How to Implement
Review in layers (highest value first):
1. **Does it solve the right problem?** Design/approach, service boundaries, API contract & backwards compatibility.
2. **Correctness**: edge cases, failure paths, concurrency/races, idempotency, transactions, error handling.
3. **Security**: authN/Z (IDOR), input validation, injection, secrets, PII in logs.
4. **Performance/reliability**: N+1, missing indexes, unbounded queries, timeouts/retries, event-loop blocking.
5. **Operability**: logs, metrics, alerts, feature flag, migration safety, rollback.
6. **Tests**: do they test behaviour and failure modes, not implementation?
7. **Maintainability**: naming, complexity, dead code.

Practices: keep PRs small; label comments (`blocking:` / `nit:` / `question:`); explain *why*; praise good work; suggest, don't rewrite; offer a call for big disagreements; review within a day.

### 5. Code Example
```md
**blocking:** `userId` is read from `req.body`, so any caller can refund anyone's booking (IDOR).
Use `req.auth.userId` and check ownership in `getForUser()`.

**blocking:** Holding a DB transaction open across the provider HTTP call risks pool exhaustion
if the provider is slow. Record intent in the tx, call the provider after commit (outbox), use an idempotency key.

**nit:** `data2` → `refundResult`.   **question:** what happens on a partial refund?
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| Thorough review | Catches defects, spreads knowledge | Slower |
| Light review + strong CI/tests | Fast | Misses design issues |
| Pair/mob instead of async review | Fast feedback, teaching | Scheduling cost |

### 7. Common Mistakes
- Nitpicking style while missing a race condition; giant PRs nobody reads.
- Harsh/ambiguous tone; rewriting the author's code your way.
- Approving without running or understanding it (also for AI-generated code).

### 8. Interview Answer
"I let tooling handle style and focus humans on design, correctness, security, reliability and operability: failure paths, idempotency, authorisation, N+1s and migrations. I keep PRs small, label comments as blocking or nit, explain the why, and ask questions instead of dictating, because the goal is better code and a better engineer, not winning the review."

### 9. Follow-up Questions
- How do you review a 3,000-line PR?
- How do you handle a senior who rejects your feedback?
- How do you review AI-generated code differently?

---

## Q3. How do you mentor engineers and raise team standards?

### 1. Interview Question
"How have you levelled up other engineers?"

### 2. Simple Explanation
Multiply impact through others: **unblock, teach, and build systems** (docs, templates, tooling) so quality doesn't depend on you.

### 3. Real-World Scenario
Juniors repeatedly ship endpoints without validation or tests. Instead of fixing each, you create a service template and a short guide.

### 4. How to Implement
1. **Pair** on the first hard task, then step back; ask guiding questions rather than giving answers.
2. **Delegate with context** (why, constraints, "done" criteria) and a safe place to fail; 1:1 feedback regularly.
3. **Review as teaching**; link to docs/ADRs; share rationale.
4. **Codify**: starter template, lint rules, PR checklist, runbooks, onboarding doc, brown-bag sessions.
5. **Create growth opportunities**: let them own a small domain, present a design, join on-call with a buddy.
6. Measure: time-to-first-PR, review rework rate, incident repeats, DORA metrics.

### 5. Code Example
```md
## PR checklist (added to template)
- [ ] Input validated at the boundary (Zod)
- [ ] AuthZ checked against the caller, not the request body
- [ ] Failure paths + timeouts considered
- [ ] Migration is backwards compatible
- [ ] Logs/metrics added; no PII
- [ ] Tests cover happy path + one failure
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| Give the answer | Fast | They don't learn, you're the bottleneck |
| Coach with questions | Deep learning | Slower; frustrating if too ambiguous |
| Do it yourself | Quick | Doesn't scale, demotivates |

### 7. Common Mistakes
- Becoming the hero/bottleneck; micromanaging; only criticising.
- Tribal knowledge instead of docs; no psychological safety for mistakes.

### 8. Interview Answer
"I pair on the first hard problem then hand it over, coach with questions, and make reviews educational. Beyond individuals I codify what I keep repeating: templates, lint rules, a PR checklist, runbooks, so the team's baseline rises without depending on me. I judge success by the team needing me less and incident repeats dropping."

### 9. Follow-up Questions
- Give an example of someone you helped grow.
- How do you handle an underperforming engineer?
- How do you balance your own delivery with mentoring time?

---

## Q4. How do you handle a production incident, and make systems observable?

### 1. Interview Question
"The API's error rate spikes at 2 a.m. Walk me through your response and what you did afterwards."

### 2. Simple Explanation
**Stabilise first, diagnose second, learn third.** Roll back or mitigate before finding root cause. Good observability makes this minutes instead of hours.

### 3. Real-World Scenario
After a deploy, p99 latency jumps from 200 ms to 8 s and 5xx hits 15%. Cause: a new query without an index exhausts the connection pool.

### 4. How to Implement
**During the incident**
1. Acknowledge, declare severity, assign an **incident commander**, open a channel; communicate status regularly.
2. Check "what changed?" (deploys, flags, traffic, dependency status).
3. **Mitigate**: rollback, disable flag, scale, shed load, fail over.
4. Diagnose with the dashboards/traces/logs; keep a timeline.

**After**
5. **Blameless post-mortem**: timeline, root + contributing causes, what went well, action items with owners/dates.
6. Fix classes of failure (alerts, tests, guardrails), not just the instance.

**Observability foundation** (instrument by default)
- **Logs**: structured JSON, request/trace id, no PII.
- **Metrics (RED/USE)**: Rate, Errors, Duration; saturation (event loop lag, pool wait, queue depth, heap).
- **Traces**: OpenTelemetry across services/DB/queue.
- **Alerts on symptoms** tied to **SLOs** (e.g. 99.9% of requests < 500 ms), with burn-rate alerts and runbooks; avoid noisy cause-based alerts.

### 5. Code Example
```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
new NodeSDK({ instrumentations: [getNodeAutoInstrumentations()] }).start();   // http, pg, aws-sdk traced

// structured log with correlation id
log.info({ reqId, route: '/bookings', durationMs, status }, 'request completed');
```
```yaml
# SLO-style alert (Prometheus): 5xx ratio > 2% for 5m
expr: sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.02
for: 5m
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| Rollback first | Fast recovery | May hide root cause (keep evidence) |
| Fix forward | Keeps progress | Riskier under pressure |
| Many alerts | Early signal | Alert fatigue |
| Few SLO-based alerts | Actionable | Need good SLIs |
| Sample traces | Cheaper | May miss rare cases |

### 7. Common Mistakes
- Debugging while users are down instead of rolling back; no clear incident commander.
- Blame in post-mortems; action items with no owner; alerting on CPU instead of user impact.
- Logs without correlation ids; secrets/PII in logs; no runbooks.

### 8. Interview Answer
"First I stabilise: confirm impact, check what changed, and roll back or disable the flag before hunting root cause, while keeping a timeline and communicating. Afterwards we run a blameless post-mortem with owned action items that fix the class of failure. I build for this up front: structured logs with trace ids, RED and saturation metrics, OpenTelemetry tracing, and SLO-based alerts with runbooks so on-call can act quickly."

### 9. Follow-up Questions
- Describe the worst incident you've handled.
- What's the difference between an SLI, SLO and SLA?
- How do you reduce alert fatigue?
- How do you debug a latency spike that only appears in production?

---

## Q5. You joined a small team with few processes. How do you establish engineering practices?

### 1. Interview Question
"How do you introduce standards in a startup without slowing it down?"

### 2. Simple Explanation
Add the **minimum process with the highest payoff**, automate it, lead by example, and iterate based on pain, not dogma.

### 3. Real-World Scenario
Direct pushes to main, manual deploys, no tests, tribal knowledge. Outages every few weeks.

### 4. How to Implement
1. **Week 1**: protected `main`, PRs with 1 reviewer, CI (typecheck, lint, tests), a README that gets a laptop running in 15 minutes.
2. **Next**: automated deploy + rollback, staging env, structured logging + error tracking, basic alerts.
3. Then: ADRs, runbooks, on-call rota, post-mortems, testing pyramid, dependency/security scanning (Dependabot/`npm audit`), feature flags.
4. Pick battles by **incident history**; get buy-in by showing time saved; keep it lightweight and revisit quarterly.

### 5. Code Example
```yaml
# .github/workflows/ci.yml
name: ci
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck && pnpm lint && pnpm test
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| Heavy process early | Consistency | Slows a tiny team |
| No process | Fast now | Outages, onboarding pain, debt |
| Automate first, document second | Sticks | Needs upfront tooling time |

### 7. Common Mistakes
- Imposing big-company process; mandating without explaining the pain it solves.
- Standards nobody enforces (no CI gate).
- Doing it all at once instead of by incident-driven priority.

### 8. Interview Answer
"I start with the smallest practices that remove the most risk: protected main, PR review, CI with typecheck, lint and tests, one-command setup, automated deploy with rollback, and basic logging and alerts. I let incidents and pain decide the next step, automate rather than police, and explain the why so the team adopts the practices instead of resenting them."

### 9. Follow-up Questions
- What would you do in your first 30/60/90 days?
- How do you handle resistance to process?
- How do you decide what to test in a fast-moving startup?
