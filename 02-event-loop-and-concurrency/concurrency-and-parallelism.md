# Event Loop, Concurrency and Parallelism

## Q1. How does Node.js handle multiple concurrent requests with one thread?

### 1. Interview Question
"If Node is single-threaded, how can it serve thousands of requests at the same time?"

### 2. Simple Explanation
Concurrency ≠ parallelism. Node handles requests **concurrently** by never waiting. When a handler starts a DB query, it hands the work to the OS/libuv, returns, and the event loop picks up the next request. When the DB answers, the callback is queued and run.

```
Request A ──► handler runs ─► await db.query() ─► (parked)
Request B ──► handler runs ─► await fetch()    ─► (parked)
                         event loop free to accept C, D, E ...
DB replies for A ──► callback queued ──► A resumes ──► response sent
```

Event loop phases (simplified): `timers → pending → poll (I/O) → check (setImmediate) → close`. Between each callback, **microtasks** run (`process.nextTick` first, then Promise callbacks).

### 3. Real-World Scenario
A product listing endpoint spends 5 ms of CPU and 95 ms waiting on Postgres. One Node thread can interleave ~hundreds of these per second. A `JSON.parse` of a 100 MB body takes 800 ms of pure CPU and blocks every other request for that time.

### 4. How to Implement
1. Use async APIs everywhere (`fs/promises`, async DB drivers, `fetch`).
2. Keep each synchronous slice short (< ~10–50 ms).
3. Break big loops with `setImmediate` or move to a worker.
4. Measure event loop lag (see code).
5. Scale across cores with multiple processes.

### 5. Code Example
```js
import { monitorEventLoopDelay } from 'node:perf_hooks';
import express from 'express';

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  console.log('event loop p99 lag (ms):', (h.percentile(99) / 1e6).toFixed(1));
  h.reset();
}, 5000).unref();

const app = express();

app.get('/bad', (_req, res) => {
  const end = Date.now() + 2000;
  while (Date.now() < end) {}          // blocks EVERY request for 2s
  res.send('done');
});

app.get('/good', async (_req, res) => {
  await new Promise((r) => setTimeout(r, 2000)); // waits without blocking
  res.send('done');
});
```

### 6. Trade-offs
- **Pro:** tiny memory per connection, no locks/race conditions on shared JS state, excellent for I/O.
- **Con:** one CPU-heavy request hurts everyone; one core per process.
- **Choose it** for APIs, proxies, real-time. **Avoid** doing heavy compute in-process.

### 7. Common Mistakes
- Sync APIs in handlers (`fs.readFileSync`, `bcrypt.hashSync`, `execSync`).
- Huge `for` loops or `JSON.stringify` on massive objects.
- Unbounded `Promise.all` over 100k items (floods DB pool / memory).
- Misordering: `process.nextTick` recursion can starve I/O.

### 8. Interview Answer
"Node uses an event loop. Slow things like DB and network calls are delegated to the OS or libuv, so the main thread never sits idle waiting; it serves other requests and resumes when results are ready. That gives high concurrency on one thread. The risk is CPU-bound code, which blocks the loop, so I keep handlers non-blocking, offload heavy work to workers, and run one process per core."

### 9. Follow-up Questions
- Order of `nextTick`, Promise, `setTimeout(0)`, `setImmediate`?
- How do you detect a blocked event loop in production?
- What is backpressure?
- How does `await` actually work under the hood?

---

## Q2. Child Processes vs Worker Threads vs Cluster vs the libuv Thread Pool — when do you use each?

### 1. Interview Question
"A request needs heavy CPU work (resizing images / generating a PDF / parsing a large CSV). What would you use: child process, worker thread, cluster, or the thread pool?"

### 2. Simple Explanation
| Tool | What it is | Memory | Best for |
|---|---|---|---|
| **libuv thread pool** | Built-in 4 threads for `fs`, `crypto.pbkdf2/scrypt`, `zlib`, `dns.lookup` | Shared | Nothing to write — it's automatic; tune `UV_THREADPOOL_SIZE` |
| **Worker Threads** | Extra JS threads in the *same process*, each with own event loop | Own heap, can share `SharedArrayBuffer` | CPU-bound JS (image/PDF, parsing, hashing, compression logic) |
| **Child Process** (`spawn/fork/exec`) | A *separate OS process* | Fully isolated | Running other programs (ffmpeg, Python), isolation of risky/untrusted code, memory-hungry jobs |
| **Cluster** | N copies of your whole server, sharing one port | Isolated per worker | Using all CPU cores for **request handling** |

Decision flow:
```
Is the work waiting on I/O?           ── yes ─► plain async/await
no (CPU-bound)
 ├─ It's a JS function in your app?   ── yes ─► Worker Thread (pool)
 ├─ It's an external binary/script?   ── yes ─► child_process.spawn
 ├─ Need to isolate crashes/memory?   ── yes ─► child process / separate service
 └─ Need more request throughput?     ── yes ─► cluster / PM2 / multiple containers
```

### 3. Real-World Scenario
An invoicing API generates PDFs. Each takes 400 ms of CPU. At 20 PDFs/s the event loop is saturated and `/health` times out. Fix: a **worker thread pool** (size = cores − 1) for rendering, or push to a queue (see `09-background-jobs`) if the user doesn't need it synchronously.

### 4. How to Implement (worker pool)
1. Create worker file with the CPU function.
2. Use a pool library (`piscina`) rather than spawning a worker per request.
3. Pass data via `postMessage` (copied) or **transfer** `ArrayBuffer`s.
4. Add timeout + queue limit; return `503` when overloaded.
5. If the job is slow (> few seconds) or retryable, use a queue instead.

### 5. Code Example
```js
// pool.js
import Piscina from 'piscina';
export const pool = new Piscina({
  filename: new URL('./resize-worker.js', import.meta.url).href,
  maxThreads: Math.max(1, (await import('node:os')).availableParallelism() - 1),
  maxQueue: 100,
});

// resize-worker.js
import sharp from 'sharp';
export default async ({ buffer, width }) =>
  sharp(buffer).resize({ width }).webp().toBuffer();

// route
import express from 'express';
import { pool } from './pool.js';
const app = express();
app.post('/resize', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res, next) => {
  try {
    const out = await pool.run({ buffer: req.body, width: 800 });
    res.type('image/webp').send(out);
  } catch (e) {
    next(e);
  }
});
```
Child process example (external binary, streaming, no shell injection):
```js
import { spawn } from 'node:child_process';
const ff = spawn('ffmpeg', ['-i', inputPath, '-vn', '-f', 'mp3', 'pipe:1']); // args array, no shell
ff.stdout.pipe(res);
ff.on('error', next);
```
Cluster (simple form; in containers prefer one process per container + orchestrator):
```js
import cluster from 'node:cluster';
import os from 'node:os';
if (cluster.isPrimary) {
  for (let i = 0; i < os.availableParallelism(); i++) cluster.fork();
  cluster.on('exit', () => cluster.fork()); // restart crashed worker
} else {
  (await import('./server.js'));
}
```

### 6. Trade-offs
- **Worker Threads**: cheap to start, can share memory; but a bug can still affect the process, and they don't help I/O.
- **Child process**: strongest isolation, any language; heavier startup, IPC serialisation cost.
- **Cluster**: simple scale-out on one machine; no shared memory (in-memory cache/session/rate-limit per worker → use Redis).
- **Thread pool**: free, but only 4 threads shared by fs+crypto+zlib+dns; saturating it slows file and password work.

### 7. Common Mistakes
- Spawning a new Worker per request (startup cost ~tens of ms).
- Using worker threads for I/O work (no benefit).
- Using `exec` with user input (command injection).
- Using cluster while keeping state (sessions, counters) in memory.
- Thinking `Promise.all` gives parallel CPU execution.

### 8. Interview Answer
"I first ask whether it's I/O or CPU. For I/O, async/await is enough. For CPU-bound JS I use a Worker Thread pool such as Piscina, sized to cores minus one, with a bounded queue. For external programs like ffmpeg I use `child_process.spawn` with an args array. To use all cores for request handling I run multiple processes via cluster, PM2 or containers, and keep state in Redis. If the job is slow or must be retried, I move it to a queue instead of doing it in the request."

### 9. Follow-up Questions
- What is the difference between `fork`, `spawn`, `exec`, `execFile`?
- How do Workers communicate (postMessage, transferables, SharedArrayBuffer + Atomics)?
- When would the thread pool be your bottleneck? (many parallel bcrypt/scrypt calls)
- Cluster vs running N containers behind a load balancer?

> Summary table of these decisions: [../13-tradeoffs-and-decisions/README.md](../13-tradeoffs-and-decisions/README.md)

---

## Q3. Synchronous vs Asynchronous operations — when is sync acceptable?

### 1. Interview Question
"Is it ever OK to use `readFileSync` in a Node server?"

### 2. Simple Explanation
Sync calls block the event loop until done; async calls let other work proceed. Blocking is harmless when **nobody else is waiting**, e.g. at startup.

### 3. Real-World Scenario
Loading TLS certificates and config at boot with `readFileSync` is fine. Doing it per request on a 2 MB template adds latency to everyone.

### 4. How to Implement
- Startup / CLI scripts / build tools: sync OK.
- Request path / long-lived server runtime: async only.
- Lint with `eslint-plugin-n` rule `n/no-sync` for server code.

### 5. Code Example
```js
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const cert = readFileSync('./cert.pem');            // once at boot: OK

app.get('/report', async (_req, res) => {
  const tpl = await readFile('./report.tpl', 'utf8'); // per request: async (or cache it)
  res.send(tpl);
});
```

### 6. Trade-offs
Sync: simpler code, deterministic ordering. Async: scales, but needs error handling discipline and can be harder to reason about.

### 7. Common Mistakes
`bcrypt.hashSync`, `execSync`, `JSON.parse` of huge payloads, sync `zlib` calls in handlers.

### 8. Interview Answer
"Sync is fine at startup or in scripts where blocking doesn't affect users. In the request path I always use async APIs so one slow operation can't stall other clients."

### 9. Follow-up Questions
- Why does `fs.promises` still use the thread pool?
- How do you convert callback APIs (`util.promisify`)?
