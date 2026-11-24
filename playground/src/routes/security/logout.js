import { refreshTokens } from './lib/store.js';
import { hash } from './lib/tokens.js';
import { json } from './lib/middleware.js';

export const method = 'post';
export const path = '/auth/logout';
export const middleware = [json];
export const doc = ['POST', '/auth/logout  {"refreshToken"}',
  'Revokes the refresh token.', '08-security/auth-and-rate-limiting.md Q1'];

export function handler(req, res) {
  refreshTokens.delete(hash(String(req.body?.refreshToken)));
  res.status(204).end();
}
