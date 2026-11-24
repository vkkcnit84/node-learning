# GET /auth/me — "Who am I?"

📄 Code: [me.js](me.js)

## In one line
Shows the logged-in user's details. It needs a valid access token.

## Real-life analogy
A bouncer checking your wristband at the door. No band, or a fake band? You don't get in.

## What you send
A header, no body:
```
Authorization: Bearer <accessToken>
```

## What happens, step by step
1. The `requireAuth` middleware reads the token from the header.
2. It checks the token's signature and expiry.
3. If it's good, the user info is attached to `req.user`.
4. The handler just sends `req.user` back.

## What you get back
| Status | Meaning |
|---|---|
| `200` | `{ user: { sub, role, org, ... } }` |
| `401` | No token, fake token, or expired token |

## Key ideas
- **Authentication = "who are you?"** This is it.
- **Middleware** is a function that runs *before* your handler, like a checkpoint. Here it blocks anyone not logged in.
- We force the algorithm to `HS256` when verifying. This blocks a known trick where attackers say "this token needs no signature".

## 🧠 Remember
> Authentication answers "who are you?", and failure gives 401.
