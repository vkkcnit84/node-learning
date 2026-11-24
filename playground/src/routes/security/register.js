import { AppError } from '../../lib/common.js';
import { users } from './lib/store.js';
import { hashPassword } from './lib/passwords.js';
import { json } from './lib/middleware.js';

export const method = 'post';
export const path = '/auth/register';
export const middleware = [json];
export const doc = ['POST', '/auth/register  {"email","password","role?","org?"}',
  'Hashes password with scrypt (+salt). role: member|admin, org: "acme"|"globex".', '08-security/auth-and-rate-limiting.md Q1'];

export async function handler(req, res) {
  const { email, password, role = 'member', org = 'acme' } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@')) throw new AppError(422, 'VALIDATION', 'valid email required');
  if (typeof password !== 'string' || password.length < 8) throw new AppError(422, 'VALIDATION', 'password min 8 chars');
  if (!['member', 'admin'].includes(role)) throw new AppError(422, 'VALIDATION', 'role must be member|admin'); // demo only!
  if (users.has(email)) throw new AppError(409, 'EMAIL_TAKEN', 'Email already registered');
  const user = { id: users.size + 1, email, role, org, passwordHash: await hashPassword(password) };
  users.set(email, user);
  res.status(201).json({ id: user.id, email, role, org });
}
