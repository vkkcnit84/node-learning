import { requireAuth } from './lib/middleware.js';

export const method = 'get';
export const path = '/auth/me';
export const middleware = [requireAuth];
export const doc = ['GET', '/auth/me', 'Needs Bearer token (authentication).', '08-security/auth-and-rate-limiting.md Q1'];

export const handler = (req, res) => res.json({ user: req.user });
