import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { refreshTokens } from './store.js';

export const SECRET = process.env.JWT_SECRET ?? 'dev-only-secret-change-me';
export const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function issueTokens(user) {
  const accessToken = jwt.sign({ sub: user.id, role: user.role, org: user.org }, SECRET, { expiresIn: '15m', algorithm: 'HS256' });
  const refreshToken = crypto.randomBytes(32).toString('hex');
  refreshTokens.set(hash(refreshToken), user.id); // store only the hash
  return { accessToken, refreshToken, expiresIn: 900 };
}
