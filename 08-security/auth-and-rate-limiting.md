# Security: Authentication, Authorization and Rate Limiting

## Q1. How do you handle authentication and authorization in a Node/Express API?

### 1. Interview Question
"Design authentication and authorization for an API with web and mobile clients."

### 2. Simple Explanation
- **Authentication (AuthN)**: who are you? (login, token verification)
- **Authorization (AuthZ)**: what can you do? (roles/permissions/ownership)

Common pattern: short-lived **access token** (JWT, ~15 min) + long-lived **refresh token** (stored hashed server-side, rotated, HttpOnly cookie for web).

```
login ─► verify password (argon2/bcrypt) ─► issue access JWT (15m) + refresh token (7d, rotating)
request ─► Authorization: Bearer <JWT> ─► verify signature/exp ─► req.user ─► authorize(role/owner)
expired ─► POST /refresh (cookie) ─► new access + new refresh (old one revoked)
```

### 3. Real-World Scenario
A SaaS app: users belong to organisations with roles (admin/member). A bug where `GET /invoices/:id` checked only that the user was logged in allowed anyone to read other tenants' invoices (IDOR / broken access control, #1 OWASP risk).

### 4. How to Implement
1. Hash passwords with **argon2id** or bcrypt (cost ≥ 12). Never store plaintext or fast hashes.
2. Issue JWTs with `sub`, `exp`, minimal claims; sign with a strong secret/asymmetric key from env/secret manager.
3. Verify on every request in middleware; pin algorithm.
4. Refresh tokens: random, stored hashed in DB/Redis, rotated on use, revocable.
5. Web: HttpOnly + Secure + SameSite cookies (+ CSRF protection if cookies used for auth).
6. Authorization at the service layer: role checks **and** resource ownership/tenant checks.
7. Rate-limit login, add lockout/MFA for sensitive accounts.

### 5. Code Example
```js
import jwt from 'jsonwebtoken';
import argon2 from 'argon2';

export async function login(req, res) {
  const user = await users.findByEmail(req.body.email);
  const ok = user && await argon2.verify(user.passwordHash, req.body.password);
  if (!ok) throw new AppError(401, 'BAD_CREDENTIALS', 'Invalid email or password'); // same msg both cases
  const access = jwt.sign({ sub: user.id, role: user.role, org: user.orgId }, process.env.JWT_SECRET,
                          { expiresIn: '15m', algorithm: 'HS256' });
  res.json({ access });
}

export function requireAuth(req, _res, next) {
  const token = req.get('authorization')?.replace(/^Bearer /, '');
  if (!token) return next(new AppError(401, 'NO_TOKEN', 'Authentication required'));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch { next(new AppError(401, 'BAD_TOKEN', 'Invalid or expired token')); }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new AppError(403, 'FORBIDDEN', 'Not allowed'));

// Ownership/tenant check in the query itself
const invoice = await db.query('SELECT * FROM invoices WHERE id=$1 AND org_id=$2', [id, req.user.org]);
if (!invoice.rows[0]) throw new AppError(404, 'NOT_FOUND', 'Not found'); // 404 avoids leaking existence
```

### 6. Trade-offs
| | JWT (stateless) | Server sessions |
|---|---|---|
| Scaling | No lookup, easy | Needs shared store (Redis) |
| Revocation | Hard until expiry | Instant |
| Size | Larger per request | Small cookie |
Mitigate JWT revocation with short expiry + refresh rotation + denylist. Third-party login: use OAuth2/OIDC (Auth0, Cognito, Keycloak) instead of rolling your own.

### 7. Common Mistakes
- Checking authN but not resource-level authZ (IDOR).
- Storing JWTs in localStorage (XSS-exposed) without considering the risk.
- Long-lived access tokens; secrets hard-coded; `alg: none`/algorithm confusion.
- Different error messages for "user not found" vs "wrong password".
- Trusting role/ids from the request body.
- Putting sensitive data in JWT payload (it is only encoded, not encrypted).

### 8. Interview Answer
"I authenticate with short-lived JWT access tokens and rotating, revocable refresh tokens, hashing passwords with argon2 or bcrypt. A middleware verifies the token on each request. Authorization is enforced in the service layer using roles plus resource ownership or tenant checks in the query, because most real vulnerabilities are broken access control rather than broken login. I rate-limit login and use OAuth/OIDC when third-party identity is needed."

### 9. Follow-up Questions
- JWT vs sessions; how do you revoke a JWT?
- OAuth2 flows (authorization code + PKCE)?
- CSRF vs XSS and where to store tokens?
- RBAC vs ABAC?
- How do you implement logout everywhere?

---

## Q2. How would you implement rate limiting?

### 1. Interview Question
"How do you protect an API from abuse and traffic bursts?"

### 2. Simple Explanation
Limit how many requests a client can make in a time window. Return `429 Too Many Requests` with `Retry-After`. Algorithms:
- **Fixed window**: simple, bursts at window edges.
- **Sliding window**: smoother, more accurate.
- **Token bucket**: allows controlled bursts, refills steadily (common choice).
- **Leaky bucket**: smooths output rate.

### 3. Real-World Scenario
A credential-stuffing bot hit `/login` 50 times/s. Global limits weren't enough; per-IP **and** per-account limits on login, stricter than the general API, stopped it.

### 4. How to Implement
1. Decide key: IP, user id, API key, or a combination; stricter limits for sensitive routes.
2. Use a **shared store (Redis)** when running multiple instances, otherwise limits are per process.
3. Set `trust proxy` so the real client IP is used behind a load balancer.
4. Return standard headers (`RateLimit-*`, `Retry-After`).
5. Also rate-limit at the edge (CDN/WAF/API gateway) for big floods.
6. Decide fail-open vs fail-closed when Redis is down.

### 5. Code Example
```js
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

const store = (prefix) => new RedisStore({ prefix, sendCommand: (...args) => redis.sendCommand(args) });

export const apiLimiter = rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false,
  store: store('rl:api:'),
  keyGenerator: (req) => req.user?.id ?? req.ip,
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 5, store: store('rl:login:'),
  keyGenerator: (req) => `${req.ip}:${req.body?.email?.toLowerCase()}`,
  skipSuccessfulRequests: true,
});

app.use('/api', apiLimiter);
app.post('/auth/login', loginLimiter, login);
```
Token bucket idea (Redis + Lua for atomicity): store `tokens` and `lastRefill`, refill by elapsed × rate, consume 1 atomically.

### 6. Trade-offs
- In-memory limiter: fast, but per-instance and resets on deploy.
- Redis limiter: accurate across instances, adds latency and a dependency.
- Gateway/CDN limiter: protects origin, less app-specific context.
- IP-based limits hurt users behind shared NAT; user/API-key limits need auth first.

### 7. Common Mistakes
- In-memory limiter with several instances.
- Forgetting `trust proxy` → everyone shares the proxy's IP (or can spoof `X-Forwarded-For`).
- Same limit for every route.
- No `Retry-After`; clients retry immediately.
- Atomicity bugs (read-then-write) in custom implementations.

### 8. Interview Answer
"I apply rate limiting at several layers: CDN/gateway for floods and in the app with Redis-backed limits so they work across instances. I pick keys by user, API key or IP, use token-bucket or sliding window, and apply tighter limits to sensitive endpoints like login. Responses are 429 with Retry-After, and I configure trust proxy so IPs are correct."

### 9. Follow-up Questions
- Fixed window vs sliding window vs token bucket?
- What if Redis fails: fail open or closed?
- How do you rate limit per tenant plan (free vs paid)?
- How do you handle distributed attackers (many IPs)?

---

## Q3. Security checklist for an Express app (quick-fire)
- `helmet()`, `cors` with explicit origins, HTTPS/HSTS.
- Validate all input (zod/joi); parameterised queries (no string-built SQL); escape output.
- Limit body size; `npm audit`/Dependabot; pin versions and lockfile.
- Secrets in env/secret manager, never in git; rotate.
- Don't leak stack traces; log without secrets/PII.
- Prevent NoSQL injection (`$ne` objects) and prototype pollution; avoid `eval`; `execFile` not `exec` with user input.
- Protect against SSRF when fetching user-provided URLs.
- Cookies: `HttpOnly`, `Secure`, `SameSite`.
