import { Router } from 'express';
import { AppError, sleep, intParam } from '../lib/common.js';

export const router = Router();
const DOC = '04-error-handling/error-handling.md';
export const docs = [
  ['GET', '/errors/operational', 'Throws AppError(404) -> clean JSON with code + requestId.', DOC + ' Q1'],
  ['GET', '/errors/validation?qty=abc', 'Input validation -> 400/422 style error.', DOC + ' Q1'],
  ['GET', '/errors/async-throw', 'Rejected promise in async handler reaches error middleware (Express 5).', DOC + ' Q1'],
  ['GET', '/errors/bug', 'Programmer bug (TypeError) -> generic 500, details hidden from client, logged.', DOC + ' Q1'],
  ['GET', '/errors/slow-upstream?timeout=500', 'Outbound call protected by AbortSignal.timeout -> 504 instead of hanging.', DOC + ' Q2'],
  ['GET', '/errors/overload', 'Load shedding: returns 503 + Retry-After when too many in flight.', DOC + ' Q2'],
  ['GET', '/health/live', 'Liveness probe.', DOC + ' Q2'],
  ['GET', '/health/ready', 'Readiness probe (503 while shutting down).', DOC + ' Q2'],
];

router.get('/errors/operational', () => {
  throw new AppError(404, 'ORDER_NOT_FOUND', 'Order 42 does not exist');
});

router.get('/errors/validation', (req, res) => {
  const qty = Number(req.query.qty);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new AppError(422, 'VALIDATION', 'qty must be a positive integer', { details: { qty: req.query.qty ?? null } });
  }
  res.json({ ok: true, qty });
});

router.get('/errors/async-throw', async () => {
  await sleep(10);
  throw new AppError(409, 'CONFLICT', 'Thrown after an await; Express 5 forwards it automatically');
});

router.get('/errors/bug', () => {
  const user = undefined;
  return user.name; // TypeError: programmer error
});

// Pretend upstream that takes 3s
router.get('/errors/upstream-fake', async (_req, res) => { await sleep(3000); res.json({ ok: true }); });
router.get('/errors/slow-upstream', async (req, res) => {
  const timeout = intParam(req.query.timeout, 500, { min: 50, max: 5000 });
  try {
    const url = `${req.protocol}://${req.get('host')}/errors/upstream-fake`;
    const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    res.json(await r.json());
  } catch (err) {
    if (err.name === 'TimeoutError') throw new AppError(504, 'UPSTREAM_TIMEOUT', `Upstream exceeded ${timeout}ms`);
    throw err;
  }
});

let inFlight = 0;
const MAX_IN_FLIGHT = 3;
router.get('/errors/overload', async (_req, res) => {
  if (inFlight >= MAX_IN_FLIGHT) {
    res.set('Retry-After', '2');
    throw new AppError(503, 'OVERLOADED', `More than ${MAX_IN_FLIGHT} concurrent requests; shedding load`);
  }
  inFlight++;
  try { await sleep(1500); res.json({ ok: true, hint: 'Fire 5 requests in parallel to see 503s' }); }
  finally { inFlight--; }
});

export const lifecycle = { shuttingDown: false };
router.get('/health/live', (_req, res) => res.json({ status: 'alive', pid: process.pid, uptimeSec: Math.round(process.uptime()) }));
router.get('/health/ready', (_req, res) =>
  lifecycle.shuttingDown ? res.status(503).json({ status: 'shutting-down' }) : res.json({ status: 'ready' }));

// Central error middleware (mounted last in app.js)
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status ?? 500;
  const entry = { level: status >= 500 ? 'error' : 'warn', requestId: req.id, status, code: err.code, msg: err.message };
  if (status >= 500) entry.stack = err.stack;
  console.log(JSON.stringify(entry));
  res.status(status).json({
    error: {
      code: err.code ?? 'INTERNAL',
      message: err.expose ? err.message : 'Something went wrong',
      details: err.details,
      requestId: req.id,
    },
  });
}

export const notFound = (req, _res, next) => next(new AppError(404, 'NOT_FOUND', `${req.method} ${req.path} not found`));
