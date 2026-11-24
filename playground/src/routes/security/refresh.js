import { AppError } from '../../lib/common.js';
import { users, refreshTokens } from './lib/store.js';
import { hash, issueTokens } from './lib/tokens.js';
import { json } from './lib/middleware.js';

export const method = 'post';
export const path = '/auth/refresh';
export const middleware = [json];
export const doc = ['POST', '/auth/refresh  {"refreshToken"}',
  'Rotates refresh token (old one becomes invalid).', '08-security/auth-and-rate-limiting.md Q1'];

export function handler(req, res) {
  const key = hash(String(req.body?.refreshToken));
  const userId = refreshTokens.get(key);
  if (!userId) throw new AppError(401, 'BAD_REFRESH', 'Invalid refresh token');
  refreshTokens.delete(key); // rotation: single use
  res.json(issueTokens([...users.values()].find((u) => u.id === userId)));
}
