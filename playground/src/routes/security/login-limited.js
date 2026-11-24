import { tokenBucket } from './lib/rate-limit.js';
import { json } from './lib/middleware.js';
import { handler as loginHandler } from './login.js';

export const method = 'post';
export const path = '/auth/login-limited';
export const middleware = [json, tokenBucket({ capacity: 5, refillPerSec: 5 / 60, key: (r) => `login:${r.ip}:${r.body?.email}` })];
export const doc = ['POST', '/auth/login-limited  {"email","password"}',
  'Login limited to 5 attempts / 60s per ip+email.', '08-security/auth-and-rate-limiting.md Q2'];

export const handler = loginHandler;
