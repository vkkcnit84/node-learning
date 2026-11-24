# Express.js: Architecture and Middleware

## Q1. How does the Express middleware pipeline work, and how would you structure a production Express app?

### 1. Interview Question
"Walk me through how a request flows through Express. How do you structure a large Express codebase?"

### 2. Simple Explanation
Express is a chain of functions `(req, res, next)`. Each can end the response or call `next()` to pass on. Order matters. Error middleware has **four** arguments `(err, req, res, next)` and is registered last.

```
Request ─► helmet ─► cors ─► requestId/logger ─► body parser ─► rate limit
        ─► auth ─► router ─► controller ─► service ─► repository (DB)
        ◄───────────────────────── response
        any thrown/next(err) ─────► error middleware
```

### 3. Real-World Scenario
Team of 8 working on an orders API. Business logic inside route handlers made it untestable and caused duplicate validation. Moving to routes → controllers → services → repositories made each layer independently testable.

### 4. How to Implement
1. `app.js` builds the app (no `listen`) so tests can import it; `server.js` starts it.
2. Global middleware in security-first order.
3. Feature folders: `orders/{routes,controller,service,repo,schema}.js`.
4. Validate input at the edge (zod/joi).
5. Controllers: parse input → call service → send response. Services: business rules, no `req/res`.
6. One central error handler (see `04-error-handling`).

### 5. Code Example
```js
// app.js
import express from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ordersRouter } from './orders/routes.js';
import { errorHandler, notFound } from './errors.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);                       // behind a load balancer
app.use(helmet());
app.use((req, res, next) => {                    // correlation id
  req.id = req.get('x-request-id') ?? randomUUID();
  res.set('x-request-id', req.id);
  next();
});
app.use(express.json({ limit: '100kb' }));       // always cap body size
app.use('/api/v1/orders', ordersRouter);
app.use(notFound);
app.use(errorHandler);                           // LAST

// orders/routes.js
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import * as service from './service.js';

const createOrder = z.object({ sku: z.string(), qty: z.number().int().positive() });
export const ordersRouter = Router();

ordersRouter.post('/', requireAuth, async (req, res) => {
  const input = createOrder.parse(req.body);     // throws ZodError -> error middleware
  const order = await service.create(req.user.id, input);
  res.status(201).json(order);
});
```
(Express 5 forwards rejected promises to the error handler automatically. On Express 4 wrap handlers: `const wrap = fn => (req,res,next) => fn(req,res,next).catch(next)`.)

### 6. Trade-offs
- Layered structure: testable, clear, but more files for tiny apps.
- Express is minimal and flexible; you must assemble security/validation yourself. Fastify/NestJS give more structure or speed — choose by team needs.

### 7. Common Mistakes
- Registering error handler before routes.
- Forgetting `next()` → request hangs.
- Sending a response twice ("headers already sent").
- No body size limit; trusting `req.body`.
- Business logic and SQL inside route handlers.
- Not setting `trust proxy` (wrong client IP breaks rate limiting).

### 8. Interview Answer
"Requests pass through ordered middleware: security headers, request ID/logging, body parsing with limits, rate limiting, auth, then routes. I separate the app from the server for testing and layer the code into routes, controllers, services and repositories, validate input at the edge, and have a single error-handling middleware at the end."

### 9. Follow-up Questions
- What changed in Express 5 (async error handling, path syntax)?
- Application-level vs router-level vs error-handling middleware?
- How do you version an API?
- Why is `express.json()` order important?
- Express vs Fastify vs NestJS?
