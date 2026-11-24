import { AppError } from '../../lib/common.js';
import { users } from './lib/store.js';
import { verifyPassword } from './lib/passwords.js';
import { issueTokens } from './lib/tokens.js';
import { json } from './lib/middleware.js';

export const method = 'post';
export const path = '/auth/login';
export const middleware = [json];
export const doc = ['POST', '/auth/login  {"email","password"}',
  'Returns 15-min access JWT + rotating refresh token. Same error for bad email/password.', '08-security/auth-and-rate-limiting.md Q1'];

// Exported so login-limited can reuse the exact same logic behind a rate limiter.
export async function handler(req, res) {
  const { email, password } = req.body ?? {};
  const user = users.get(email);
  const ok = user ? await verifyPassword(String(password), user.passwordHash) : false;
  if (!ok) throw new AppError(401, 'BAD_CREDENTIALS', 'Invalid email or password'); // same message either way
  res.json(issueTokens(user));
}
