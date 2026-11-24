import { AppError } from '../../lib/common.js';
import { INVOICES } from './lib/store.js';
import { requireAuth } from './lib/middleware.js';

export const method = 'get';
export const path = '/auth/invoices/:id';
export const middleware = [requireAuth];
export const doc = ['GET', '/auth/invoices/:id',
  'Tenant isolation: users of another org get 404 (prevents IDOR).', '08-security/auth-and-rate-limiting.md Q1'];

export function handler(req, res) {
  // ownership/tenant check is part of the lookup: wrong tenant == "not found"
  const inv = INVOICES.find((i) => i.id === Number(req.params.id) && i.org === req.user.org);
  if (!inv) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
  res.json(inv);
}
