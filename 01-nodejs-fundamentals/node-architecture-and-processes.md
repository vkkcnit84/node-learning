# Node.js Architecture, Processes and Threads

## Q1. How is Node.js structured internally, and what is the difference between a process and a thread?

### 1. Interview Question
"Explain how Node.js runs your code. Is it single-threaded? What is the difference between a process and a thread?"

### 2. Simple Explanation
- **V8** runs your JavaScript. **libuv** (a C library) handles the event loop, network I/O, file system, DNS and a small **thread pool** (default 4 threads).
- Your JS runs on **one main thread**. Node itself is *not* single-threaded: libuv threads, V8 GC threads and optional Worker Threads exist.
- **Process** = an independent program instance with its **own memory**. **Thread** = a unit of execution **inside** a process that **shares memory** with other threads.

```
        Process (one Node.js app, own memory)
 ┌─────────────────────────────────────────────┐
 │ Main thread: V8 + event loop (your JS)      │
 │ libuv thread pool (fs, crypto, zlib, dns)   │
 │ Worker threads (optional, own V8 isolate)   │
 └─────────────────────────────────────────────┘
```

### 3. Real-World Scenario
An Express API serves 2,000 req/s. Each request is mostly waiting on Postgres or Redis. One thread is enough because it never *waits* — it registers a callback and moves on. But one request that hashes a 50 MB file with a sync loop freezes all 2,000 users.

### 4. How to Implement (thinking steps)
1. Classify work: **I/O-bound** (DB, HTTP, disk) → stay on main thread with async APIs.
2. **CPU-bound** (image resize, big JSON parse, crypto loops) → Worker Threads (see `02-event-loop-and-concurrency`).
3. Need to use all CPU cores for I/O → run multiple processes (cluster / PM2 / containers).
4. Need isolation or another binary (ffmpeg) → child process.

### 5. Code Example
```js
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import os from 'node:os';

console.log('pid', process.pid, 'cores', os.availableParallelism());
console.log('libuv pool size', process.env.UV_THREADPOOL_SIZE ?? 4);

if (isMainThread) {
  new Worker(new URL(import.meta.url)); // same process, new thread, own memory heap
} else {
  parentPort.postMessage('hello from a thread in the same pid');
}
```

### 6. Trade-offs
| | Process | Thread |
|---|---|---|
| Memory | Isolated, heavier (~30–50 MB for Node) | Shared/transferable, lighter |
| Crash impact | One dies, others live | A native crash can take the whole process |
| Communication | IPC / network (slower, serialised) | `postMessage`, `SharedArrayBuffer`, transferables |
| Use for | Scaling out, isolation, fault tolerance | Offloading CPU work |

### 7. Common Mistakes
- Saying "Node is single-threaded, so it can't do parallel work". It can; JS execution is single-threaded per isolate.
- Thinking `async/await` makes code parallel. It only avoids blocking while *waiting*.
- Running CPU work in the request handler.

### 8. Interview Answer
"Node runs JavaScript on a single main thread using V8, with libuv providing the event loop and a thread pool for things like file system and crypto. That's why it's great for I/O-heavy workloads: it never blocks waiting. A process has its own memory; threads share a process's memory. For CPU-heavy work I use Worker Threads, and to use all cores I run several processes behind a load balancer."

### 9. Follow-up Questions
- What runs in the libuv thread pool and what doesn't (network sockets don't)?
- How do you change the pool size, and when would you?
- What is a V8 isolate?
- How do two processes share data? (IPC, Redis, DB — not memory.)

> Detailed comparison of Worker Threads vs Child Processes vs Cluster: [../02-event-loop-and-concurrency/concurrency-and-parallelism.md](../02-event-loop-and-concurrency/concurrency-and-parallelism.md)

---

## Q2. CommonJS vs ES Modules — what should a modern project use?

### 1. Interview Question
"What is the difference between `require` and `import`? Which do you use and why?"

### 2. Simple Explanation
CommonJS (`require`) loads modules **synchronously** at runtime and is the old Node default. ES Modules (`import`) are the JS standard, are statically analysable, load asynchronously and support top-level `await`.

### 3. Real-World Scenario
A team migrating a 5-year-old Express app: half the libraries are ESM-only now (e.g. newer `nanoid`, `chalk`), so `require()` breaks.

### 4. How to Implement
1. Set `"type": "module"` in `package.json` (or use `.mjs`).
2. Use full file extensions in relative imports: `import x from './x.js'`.
3. Replace `__dirname` with `import.meta.dirname` (Node 20.11+).
4. Use `createRequire` for legacy CJS-only packages if needed.

### 5. Code Example
```js
// ESM
import express from 'express';
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('./config.json', import.meta.url)));
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(config.port);
```

### 6. Trade-offs
- ESM: standard, tree-shakeable, top-level await. Cons: migration pain, extensions required, some tooling (older Jest configs) friction.
- CJS: works everywhere legacy. Cons: no top-level await, can't import ESM-only packages with `require` (partly relaxed in newer Node).

### 7. Common Mistakes
- Mixing both in one file.
- Forgetting `.js` extension in ESM imports.
- Using `__dirname` in ESM.

### 8. Interview Answer
"For new projects I use ESM — it's the standard, supports top-level await and is future-proof. For existing CJS codebases I migrate incrementally, because the main risks are extension rules and tooling, not the language features."

### 9. Follow-up Questions
- What does `require` cache, and how does that affect singletons?
- Can ESM import CJS? Can CJS import ESM?
- What are circular dependencies and how do they behave in each system?
