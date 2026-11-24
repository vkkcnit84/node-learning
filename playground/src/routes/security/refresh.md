# POST /auth/refresh — "Get a new key card"

📄 Code: [refresh.js](refresh.js)

## In one line
Swaps your old refresh token for a brand-new pair of tokens, without typing your password again.

## Real-life analogy
A one-time-use coupon. You hand it in, you get a fresh coupon. The old one is torn up.

## What you send
```json
{ "refreshToken": "9f3a..." }
```

## What happens, step by step
1. Look up the token in our saved list.
2. Not found? Reject with `401`.
3. Found? **Delete it right away** (single use).
4. Issue a new access token and a new refresh token.

## What you get back
| Status | Meaning |
|---|---|
| `200` | New tokens |
| `401` | Token unknown, already used, or logged out |

## Key ideas
- This is called **rotation**: each refresh token works exactly once.
- If someone steals a token and uses it, the real owner's copy stops working. That's a warning sign something is wrong.
- Try it: call refresh twice with the same token. The second call fails.

## 🧠 Remember
> Refresh tokens are single-use coupons.
