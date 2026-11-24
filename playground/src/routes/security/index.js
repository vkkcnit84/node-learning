// Security module: one file (+ one .md) per endpoint. This file only mounts them.
import { Router } from 'express';
import * as register from './register.js';
import * as login from './login.js';
import * as refresh from './refresh.js';
import * as logout from './logout.js';
import * as me from './me.js';
import * as adminOnly from './admin-only.js';
import * as invoiceById from './invoice-by-id.js';
import * as tokenBucket from './token-bucket.js';
import * as loginLimited from './login-limited.js';

export { requireAuth, requireRole } from './lib/middleware.js';

const endpoints = [register, login, refresh, logout, me, adminOnly, invoiceById, tokenBucket, loginLimited];

export const router = Router();
for (const e of endpoints) router[e.method](e.path, ...e.middleware, e.handler);

export const docs = endpoints.map((e) => e.doc); // consumed by GET / and `npm run docs`
