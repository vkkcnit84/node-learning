# Runnable Playground

One Express 5 app where every interview scenario is a live endpoint. No Redis/Postgres needed (simulated in memory) so concepts stay visible.

```bash
npm install
npm start            # http://localhost:3000   (GET / lists every endpoint)
npm run smoke        # 25 automated checks of the key behaviours
npm run docs         # regenerates ENDPOINTS.md
```

- **Full endpoint list:** [ENDPOINTS.md](ENDPOINTS.md), or open http://localhost:3000 in a browser.
- **Click-to-run requests:** [requests.http](requests.http) (VS Code "REST Client" extension), or use curl.
- **Theory for each endpoint:** every row links to the matching question in the topic folders.

## Experiments worth doing (and what you should see)
| Experiment | How | What it proves |
|---|---|---|
| Event loop blocking | Open `/concurrency/blocking?ms=5000`, then quickly `/concurrency/ping` | Ping waits ~5s. Swap in `/non-blocking`: ping is instant |
| Worker threads | `/concurrency/cpu-main?n=42` vs `/cpu-worker?n=42` while hitting `/ping` | Worker keeps the server responsive |
| Thread pool waves | `/concurrency/threadpool?jobs=8` then `UV_THREADPOOL_SIZE=8 npm start` | Finish times come in waves of 4 |
| Buffer vs stream | `/files/memory-demo?mode=buffer&mb=200` vs `mode=stream` | Buffer memory grows with size |
| N+1 | `/perf/n-plus-one` vs `/perf/batched` | 51 queries vs 2 |
| Cache stampede | `seq 20 \| xargs -P20 -I{} curl -s localhost:3000/cache/product/2` then `/cache/stats` | 20 misses, 1 DB read |
| Load shedding | 5 parallel `curl localhost:3000/errors/overload` | Extra requests get 503 + Retry-After |
| Rate limit | Call `/rate-limit/token-bucket` 7 times | 429 + Retry-After |
| Retries | `/reliability/retry?failRate=0.7` several times | Attempts with growing, jittered delays |
| Memory leak | `node --expose-gc src/server.js`, call `/leak/leaky` 50×, watch `/leak/stats` | Leaky grows; `/leak/bounded` caps at 20 |
| Graceful shutdown | Start a `/concurrency/non-blocking?ms=5000`, press Ctrl+C | In-flight request finishes before exit |

## Not covered here (needs real infrastructure)
Real Postgres pooling, Redis, BullMQ, clustering. The simulated versions show the same concepts; the theory docs show the production libraries.
