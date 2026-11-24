import { Router } from 'express';
import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { sleep, intParam } from '../lib/common.js';

export const router = Router();
const DOC = '02-event-loop-and-concurrency/concurrency-and-parallelism.md';
export const docs = [
  ['GET', '/concurrency/blocking?ms=2000', 'Busy-loops the main thread: EVERY other request freezes. Fire /concurrency/ping meanwhile.', DOC + ' Q1'],
  ['GET', '/concurrency/non-blocking?ms=2000', 'Waits with a timer: other requests keep flowing.', DOC + ' Q1'],
  ['GET', '/concurrency/ping', 'Instant response. Call it while /blocking runs to feel the difference.', DOC + ' Q1'],
  ['GET', '/concurrency/cpu-main?n=40', 'fib(n) on the main thread (blocks the loop).', DOC + ' Q2'],
  ['GET', '/concurrency/cpu-worker?n=40', 'fib(n) in a Worker Thread (loop stays free).', DOC + ' Q2'],
  ['GET', '/concurrency/child-process', 'spawn() a separate OS process; shows its pid differs.', DOC + ' Q2'],
  ['GET', '/concurrency/threadpool?jobs=8', 'Runs N pbkdf2 calls in libuv pool (default 4 threads) and shows timing.', DOC + ' Q2'],
  ['GET', '/concurrency/event-loop-lag', 'Reports event loop delay percentiles.', DOC + ' Q1'],
];

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));

router.get('/ping', (_req, res) => res.json({ pong: Date.now() }));

router.get('/blocking', (req, res) => {
  const ms = intParam(req.query.ms, 2000, { max: 10_000 });
  const end = Date.now() + ms;
  while (Date.now() < end) { /* blocks everyone */ }
  res.json({ blockedMs: ms });
});

router.get('/non-blocking', async (req, res) => {
  const ms = intParam(req.query.ms, 2000, { max: 10_000 });
  await sleep(ms);
  res.json({ waitedMs: ms });
});

router.get('/cpu-main', (req, res) => {
  const n = intParam(req.query.n, 38, { max: 45 });
  const t = performance.now();
  res.json({ n, result: fib(n), thread: 'main', ms: Math.round(performance.now() - t) });
});

router.get('/cpu-worker', (req, res, next) => {
  const n = intParam(req.query.n, 38, { max: 45 });
  const t = performance.now();
  const w = new Worker(new URL('../lib/fib-worker.js', import.meta.url), { workerData: { n } });
  w.once('message', (m) => res.json({ n, ...m, ms: Math.round(performance.now() - t) }));
  w.once('error', next);
});

router.get('/child-process', (_req, res, next) => {
  const child = spawn(process.execPath, ['-e', 'console.log(JSON.stringify({childPid: process.pid}))']);
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.on('error', next);
  child.on('close', () => res.json({ parentPid: process.pid, ...JSON.parse(out) }));
});

router.get('/threadpool', async (req, res) => {
  const jobs = intParam(req.query.jobs, 8, { min: 1, max: 32 });
  const t = performance.now();
  const times = await Promise.all(
    Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
      const s = performance.now();
      crypto.pbkdf2('pw', 'salt', 300_000, 64, 'sha512', (e) => (e ? reject(e) : resolve(Math.round(performance.now() - s))));
    })),
  );
  res.json({ jobs, poolSize: process.env.UV_THREADPOOL_SIZE ?? 4, finishTimesMs: times, totalMs: Math.round(performance.now() - t),
    note: 'With 4 threads, jobs finish in waves of 4.' });
});

const hist = monitorEventLoopDelay({ resolution: 10 });
hist.enable();
router.get('/event-loop-lag', (_req, res) => {
  const out = { p50ms: hist.percentile(50) / 1e6, p99ms: hist.percentile(99) / 1e6, maxMs: hist.max / 1e6 };
  hist.reset();
  res.json(out);
});
