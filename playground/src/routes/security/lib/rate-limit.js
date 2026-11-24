import { AppError } from '../../../lib/common.js';

// In-memory; use Redis when running multiple instances.
const buckets = new Map();

export function tokenBucket({ capacity, refillPerSec, key }) {
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const b = buckets.get(k) ?? { tokens: capacity, last: now };
    b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
    b.last = now;
    const allowed = b.tokens >= 1;
    if (allowed) b.tokens -= 1;
    buckets.set(k, b);
    res.set('RateLimit-Remaining', String(Math.floor(b.tokens)));
    if (allowed) return next();
    const retry = Math.ceil((1 - b.tokens) / refillPerSec);
    res.set('Retry-After', String(retry));
    next(new AppError(429, 'RATE_LIMITED', `Too many requests, retry in ${retry}s`));
  };
}
