import express from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../../../lib/common.js';
import { SECRET } from './tokens.js';

export const json = express.json({ limit: '10kb' });

export function requireAuth(req, _res, next) {
  const token = req.get('authorization')?.replace(/^Bearer /i, '');
  if (!token) throw new AppError(401, 'NO_TOKEN', 'Authentication required');
  try {
    req.user = jwt.verify(token, SECRET, { algorithms: ['HS256'] }); // pin algorithm
    next();
  } catch {
    throw new AppError(401, 'BAD_TOKEN', 'Invalid or expired token');
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'FORBIDDEN', 'You do not have permission'));
