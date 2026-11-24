import { Router } from 'express';
import { fakeDb, DB_LATENCY } from '../lib/common.js';

export const router = Router();
const DOC = '06-performance-and-scalability/performance-and-scaling.md';
export const docs = [
  ['GET', '/perf/n-plus-one', `SLOW: 1 query for orders + 1 per order (each query ~${DB_LATENCY}ms). Returns query count + time.`, DOC + ' Q1'],
  ['GET', '/perf/batched', 'FAST: 2 queries total using one batched "WHERE id = ANY(...)" lookup.', DOC + ' Q1'],
  ['GET', '/perf/sequential', 'Independent calls awaited one after another.', DOC + ' Q1'],
  ['GET', '/perf/parallel', 'Same calls with Promise.all: roughly 1/3 the time.', DOC + ' Q1'],
];

async function measure(res, fn) {
  const before = fakeDb.queries;
  const t = performance.now();
  const data = await fn();
  res.json({ queries: fakeDb.queries - before, ms: Math.round(performance.now() - t), sample: data.slice?.(0, 2) ?? data });
}

router.get('/n-plus-one', (_req, res) => measure(res, async () => {
  const orders = await fakeDb.orders();
  for (const o of orders) o.items = await fakeDb.itemsForOrder(o.id); // N queries
  return orders;
}));

router.get('/batched', (_req, res) => measure(res, async () => {
  const orders = await fakeDb.orders();
  const items = await fakeDb.itemsForOrders(orders.map((o) => o.id));
  const byOrder = Map.groupBy(items, (i) => i.orderId);
  return orders.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
}));

router.get('/sequential', (_req, res) => measure(res, async () => {
  const a = await fakeDb.orders();
  const b = await fakeDb.profile();
  const c = await fakeDb.orders();
  return [a.length, b, c.length];
}));

router.get('/parallel', (_req, res) => measure(res, async () => {
  const [a, b, c] = await Promise.all([fakeDb.orders(), fakeDb.profile(), fakeDb.orders()]);
  return [a.length, b, c.length];
}));
