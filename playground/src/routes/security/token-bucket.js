import { tokenBucket } from './lib/rate-limit.js';

export const method = 'get';
export const path = '/rate-limit/token-bucket';
export const middleware = [tokenBucket({ capacity: 5, refillPerSec: 0.5, key: (r) => `tb:${r.ip}` })];
export const doc = ['GET', '/rate-limit/token-bucket',
  'Token bucket: 5 burst, refills 1 token/2s. Returns 429 + Retry-After.', '08-security/auth-and-rate-limiting.md Q2'];

export const handler = (_req, res) => res.json({ ok: true });
