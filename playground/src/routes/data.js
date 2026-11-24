import { Router } from 'express';
import express from 'express';
import { AppError, sleep, intParam } from '../lib/common.js';

export const router = Router();
const DOC = '07-database-and-caching/database-and-caching.md';
export const docs = [
  ['GET', '/cache/product/:id', 'Cache-aside with TTL + request coalescing. Response says HIT or MISS.', DOC + ' Q2'],
  ['PUT', '/cache/product/:id  {"price": 99}', 'Updates the "DB" and invalidates the cache key.', DOC + ' Q2'],
  ['GET', '/cache/stats', 'Hits, misses, DB reads (shows coalescing: 20 parallel misses -> 1 DB read).', DOC + ' Q2'],
  ['GET', '/db/pool-demo?requests=10', 'Simulated pool of 3 connections: shows queueing, wait time and exhaustion timeout.', DOC + ' Q1'],
  ['GET', '/db/pool-stats', 'Pool size / in-use / waiting.', DOC + ' Q1'],
];

// ---------- Cache-aside ----------
const productsDb = new Map([[1, { id: 1, name: 'Keyboard', price: 50 }], [2, { id: 2, name: 'Mouse', price: 20 }]]);
const cache = new Map(); // key -> { value, expiresAt }
const inflight = new Map();
const stats = { hits: 0, misses: 0, dbReads: 0 };
const TTL = 10_000;

async function loadProduct(id) {
  stats.dbReads++;
  await sleep(100); // slow DB
  const p = productsDb.get(id);
  if (!p) throw new AppError(404, 'NOT_FOUND', `Product ${id} not found`);
  return p;
}

router.get('/cache/product/:id', async (req, res) => {
  const id = intParam(req.params.id, 0, { min: 1 });
  const key = `product:${id}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    stats.hits++;
    return res.json({ cache: 'HIT', ttlLeftMs: hit.expiresAt - Date.now(), product: hit.value });
  }
  stats.misses++;
  // coalesce: concurrent misses share ONE db read (prevents cache stampede)
  if (!inflight.has(key)) inflight.set(key, loadProduct(id).finally(() => inflight.delete(key)));
  const value = await inflight.get(key);
  cache.set(key, { value, expiresAt: Date.now() + TTL + Math.floor(Math.random() * 1000) }); // jittered TTL
  res.json({ cache: 'MISS', product: value });
});

router.put('/cache/product/:id', express.json({ limit: '10kb' }), async (req, res) => {
  const id = intParam(req.params.id, 0, { min: 1 });
  const p = productsDb.get(id);
  if (!p) throw new AppError(404, 'NOT_FOUND', `Product ${id} not found`);
  if (typeof req.body?.price !== 'number') throw new AppError(422, 'VALIDATION', 'price must be a number');
  productsDb.set(id, { ...p, price: req.body.price }); // 1) write DB
  cache.delete(`product:${id}`);                         // 2) invalidate
  res.json({ updated: productsDb.get(id), cacheInvalidated: true });
});

router.get('/cache/stats', (_req, res) => res.json({ ...stats, keys: [...cache.keys()] }));

// ---------- Connection pool simulation ----------
class Pool {
  constructor(max, acquireTimeoutMs) { this.max = max; this.timeout = acquireTimeoutMs; this.inUse = 0; this.waiters = []; }
  acquire() {
    if (this.inUse < this.max) { this.inUse++; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const w = { resolve };
      w.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        reject(new AppError(503, 'POOL_TIMEOUT', 'Timed out waiting for a DB connection (pool exhausted)'));
      }, this.timeout);
      this.waiters.push(w);
    });
  }
  release() {
    const next = this.waiters.shift();
    if (next) { clearTimeout(next.timer); next.resolve(); } else this.inUse--;
  }
}
const pool = new Pool(3, 1500);

router.get('/db/pool-demo', async (req, res) => {
  const n = intParam(req.query.requests, 10, { min: 1, max: 50 });
  const t0 = performance.now();
  const results = await Promise.allSettled(Array.from({ length: n }, async (_, i) => {
    const waitStart = performance.now();
    await pool.acquire();
    const waitedMs = Math.round(performance.now() - waitStart);
    try { await sleep(500); return { i, waitedMs }; } // a 500ms query
    finally { pool.release(); }                         // ALWAYS release
  }));
  res.json({
    poolMax: pool.max, totalMs: Math.round(performance.now() - t0),
    ok: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    timedOut: results.filter((r) => r.status === 'rejected').length,
    note: 'Only 3 run at once; the rest wait. Raise requests to see timeouts. More connections is not always better.',
  });
});
router.get('/db/pool-stats', (_req, res) => res.json({ max: pool.max, inUse: pool.inUse, waiting: pool.waiters.length }));
