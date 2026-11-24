# GET /auth/admin-only — "Admins only"

📄 Code: [admin-only.js](admin-only.js)

## In one line
Only users with the `admin` role can see this. Everyone else is refused.

## Real-life analogy
Office building. Your badge opens the front door (you're logged in), but only managers' badges open the server room.

## What you send
```
Authorization: Bearer <token of an admin>
```

## What happens, step by step
1. `requireAuth` → are you logged in? (If not: `401`)
2. `requireRole('admin')` → are you an admin? (If not: `403`)
3. Handler sends the secret data.

## What you get back
| Status | Meaning |
|---|---|
| `200` | You're an admin ✅ |
| `401` | Not logged in |
| `403` | Logged in, but not allowed |

## Key ideas
- **Authorization = "what are you allowed to do?"** It's different from authentication.
- **401 vs 403** (a classic interview question):
  - `401` = "I don't know who you are"
  - `403` = "I know who you are, and the answer is no"
- **Order matters:** `requireAuth` must run first, because it creates `req.user`, which `requireRole` reads.

## 🧠 Remember
> 401 = not logged in. 403 = logged in but forbidden.
