// Shared helpers: typed errors, sleep, and a fake "database" with latency.
export class AppError extends Error {
  constructor(status, code, message, { cause, details } = {}) {
    super(message, { cause });
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const intParam = (value, def, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number.parseInt(value ?? def, 10);
  if (Number.isNaN(n) || n < min || n > max) {
    throw new AppError(400, 'BAD_PARAM', `Expected integer between ${min} and ${max}, got "${value}"`);
  }
  return n;
};

// Fake DB: every query costs ~DB_LATENCY ms. Lets us show N+1 vs batching without Postgres.
export const DB_LATENCY = 20;
const ORDERS = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, userId: 1, total: (i + 1) * 10 }));
const ITEMS = ORDERS.flatMap((o) => [
  { orderId: o.id, sku: `SKU-${o.id}-A` },
  { orderId: o.id, sku: `SKU-${o.id}-B` },
]);
export const fakeDb = {
  queries: 0,
  async orders() { this.queries++; await sleep(DB_LATENCY); return ORDERS; },
  async itemsForOrder(id) { this.queries++; await sleep(DB_LATENCY); return ITEMS.filter((i) => i.orderId === id); },
  async itemsForOrders(ids) { this.queries++; await sleep(DB_LATENCY); return ITEMS.filter((i) => ids.includes(i.orderId)); },
  async profile() { this.queries++; await sleep(DB_LATENCY); return { id: 1, name: 'Demo User' }; },
};
