import { Router } from 'express';
import { AppError, sleep, intParam } from '../lib/common.js';

export const router = Router();
const DOC = '11-production-and-deployment/timeouts-retries-logging.md';
const DOC_LEAK = '10-testing-and-debugging/debugging-memory-leaks.md';
export const docs = [
  ['GET', '/reliability/upstream?failRate=0.6&slowRate=0', 'Fake flaky third-party API (random 503 / slow responses).', DOC + ' Q1'],
  ['GET', '/reliability/retry?failRate=0.6', 'Calls upstream with timeout + exponential backoff + jitter; shows every attempt.', DOC + ' Q1'],
  ['GET', '/reliability/breaker?fail=true', 'Circuit breaker around a failing dependency: CLOSED -> OPEN (fail fast) -> HALF_OPEN.', DOC + ' Q1'],
  ['GET', '/reliability/breaker-state', 'Current breaker state.', DOC + ' Q1'],
  ['GET', '/metrics', 'Prometheus-style metrics: request counts, latency, heap, event-loop lag.', DOC + ' Q2'],
  ['GET', '/leak/leaky', 'LEAK: appends 1MB per call to an unbounded array.', DOC_LEAK + ' Q1'],
  ['GET', '/leak/bounded', 'FIX: bounded cache (max 20 entries, FIFO eviction).', DOC_LEAK + ' Q1'],
  ['GET', '/leak/stats', 'Heap usage + sizes of both caches. Call /leak/leaky repeatedly and watch heapUsedMB.', DOC_LEAK + ' Q1'],
  ['DELETE', '/leak/reset', 'Clears leaked data.', DOC_LEAK + ' Q1'],
];

// ---------- fake flaky upstream ----------
router.get('/reliability/upstream', async (req, res) => {
  const failRate = Number(req.query.failRate ?? 0.5), slowRate = Number(req.query.slowRate ?? 0);
  if (Math.random() < slowRate) await sleep(3000);
  if (Math.random() < failRate) throw new AppError(503, 'UPSTREAM_DOWN', 'upstream unavailable');
  res.json({ rate: 4.99 });
});

// ---------- retry with backoff + jitter ----------
async function fetchWithRetry(url, { retries = 3, timeout = 800, base = 100 } = {}, attemptsLog = []) {
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
      attemptsLog.push({ attempt: attempt + 1, status: r.status, ms: Date.now() - started });
      if (r.ok) return r;
      if (![429, 502, 503, 504].includes(r.status) || attempt >= retries) return r; // 4xx: don't retry
    } catch (err) {
      attemptsLog.push({ attempt: attempt + 1, error: err.name, ms: Date.now() - started });
      if (attempt >= retries) throw err;
    }
    await sleep(base * 2 ** attempt * (0.5 + Math.random())); // exponential backoff + jitter
  }
}

router.get('/reliability/retry', async (req, res) => {
  const failRate = Number(req.query.failRate ?? 0.6);
  const attempts = [];
  const url = `${req.protocol}://${req.get('host')}/reliability/upstream?failRate=${failRate}`;
  try {
    const r = await fetchWithRetry(url, {}, attempts);
    res.status(r.ok ? 200 : 502).json({ success: r.ok, attempts });
  } catch (err) {
    throw new AppError(504, 'UPSTREAM_FAILED', 'All retries exhausted', { details: { attempts, last: err.name } });
  }
});

// ---------- circuit breaker ----------
const breaker = { state: 'CLOSED', failures: 0, openedAt: 0, threshold: 3, resetMs: 5000 };
router.get('/reliability/breaker', async (req, res) => {
  const now = Date.now();
  if (breaker.state === 'OPEN') {
    if (now - breaker.openedAt < breaker.resetMs) {
      return res.status(200).json({ source: 'fallback', reason: 'breaker OPEN, failing fast', rate: 5.0, retryInMs: breaker.resetMs - (now - breaker.openedAt) });
    }
    breaker.state = 'HALF_OPEN'; // allow one trial call
  }
  try {
    if (req.query.fail === 'true') throw new Error('dependency failed');
    breaker.state = 'CLOSED'; breaker.failures = 0;
    res.json({ source: 'upstream', state: breaker.state, rate: 4.99 });
  } catch {
    breaker.failures++;
    if (breaker.state === 'HALF_OPEN' || breaker.failures >= breaker.threshold) { breaker.state = 'OPEN'; breaker.openedAt = Date.now(); }
    res.status(200).json({ source: 'fallback', reason: 'call failed', state: breaker.state, failures: breaker.failures, rate: 5.0 });
  }
});
router.get('/reliability/breaker-state', (_req, res) => res.json(breaker));

// ---------- metrics ----------
export const metrics = { total: 0, byStatus: {}, durationMsSum: 0 };
router.get('/metrics', (_req, res) => {
  const m = process.memoryUsage();
  const lines = [
    `http_requests_total ${metrics.total}`,
    ...Object.entries(metrics.byStatus).map(([s, c]) => `http_requests_by_status{status="${s}"} ${c}`),
    `http_request_duration_ms_avg ${(metrics.durationMsSum / Math.max(1, metrics.total)).toFixed(2)}`,
    `process_heap_used_bytes ${m.heapUsed}`,
    `process_rss_bytes ${m.rss}`,
    `process_uptime_seconds ${Math.round(process.uptime())}`,
  ];
  res.type('text/plain').send(lines.join('\n') + '\n');
});

// ---------- memory leak demo ----------
const leaked = [];
const bounded = [];
router.get('/leak/leaky', (_req, res) => { leaked.push(Buffer.alloc(1024 * 1024, 1)); res.json({ leakedItems: leaked.length }); });
router.get('/leak/bounded', (_req, res) => {
  bounded.push(Buffer.alloc(1024 * 1024, 1));
  if (bounded.length > 20) bounded.shift(); // eviction keeps memory bounded
  res.json({ boundedItems: bounded.length });
});
router.get('/leak/stats', (_req, res) => {
  global.gc?.();
  const m = process.memoryUsage();
  res.json({ heapUsedMB: Math.round(m.heapUsed / 1048576), rssMB: Math.round(m.rss / 1048576), externalMB: Math.round(m.external / 1048576),
    leakedItems: leaked.length, boundedItems: bounded.length, tip: 'Buffers count as "external"/rss. Start with `node --expose-gc` for accurate after-GC numbers.' });
});
router.delete('/leak/reset', (_req, res) => { leaked.length = 0; bounded.length = 0; res.status(204).end(); });
