# Security module — start here

Everything about **who can do what**: sign up, log in, protect pages, stop abuse.

## How the pieces fit (the story)
```
register  →  login  →  me / admin-only / invoices  →  refresh  →  logout
 (sign up)   (get tokens)   (use the token)           (renew)     (cancel)

token-bucket + login-limited = "slow down" protection
```

## Endpoints
| Endpoint | In plain words | Doc | Code |
|---|---|---|---|
| POST /auth/register | Sign up | [doc](register.md) | [js](register.js) |
| POST /auth/login | Log in, get tokens | [doc](login.md) | [js](login.js) |
| POST /auth/refresh | Renew tokens | [doc](refresh.md) | [js](refresh.js) |
| POST /auth/logout | Cancel refresh token | [doc](logout.md) | [js](logout.js) |
| GET /auth/me | Who am I? | [doc](me.md) | [js](me.js) |
| GET /auth/admin-only | Admins only | [doc](admin-only.md) | [js](admin-only.js) |
| GET /auth/invoices/:id | Only your company's data | [doc](invoice-by-id.md) | [js](invoice-by-id.js) |
| GET /rate-limit/token-bucket | Rate limit demo | [doc](token-bucket.md) | [js](token-bucket.js) |
| POST /auth/login-limited | Login with 5-try limit | [doc](login-limited.md) | [js](login-limited.js) |

## 5 words to know
| Word | Meaning |
|---|---|
| **Authentication** | Who are you? (→ 401 if not) |
| **Authorization** | What may you do? (→ 403 if not) |
| **JWT** | A signed note proving who you are |
| **Hash** | One-way scramble of a password |
| **Middleware** | A checkpoint function that runs before the handler |

## Folder layout
- Each endpoint = one `.js` file + one `.md` file with the same name.
- `index.js` just plugs them all into Express.
- `lib/` holds shared helpers (password hashing, tokens, the auth checkpoints, the rate limiter, fake database).

## Reading order for revision
1. register → 2. login → 3. me → 4. admin-only → 5. invoice-by-id → 6. refresh → 7. logout → 8. token-bucket → 9. login-limited
