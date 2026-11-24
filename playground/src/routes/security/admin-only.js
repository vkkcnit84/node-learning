import { requireAuth, requireRole } from './lib/middleware.js';

export const method = 'get';
export const path = '/auth/admin-only';
export const middleware = [requireAuth, requireRole('admin')];
export const doc = ['GET', '/auth/admin-only', 'Needs role=admin (authorization, 403 otherwise).', '08-security/auth-and-rate-limiting.md Q1'];

export const handler = (_req, res) => res.json({ secret: 'admin dashboard data' });
