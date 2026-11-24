# POST /auth/login-limited — "Login with a lockout"

📄 Code: [login-limited.js](login-limited.js)

## In one line
The same login as [login.md](login.md), but you only get **5 tries per minute**.

## Real-life analogy
An ATM that blocks you after a few wrong PIN guesses.

## What you send
Same as login:
```json
{ "email": "a@acme.com", "password": "password123" }
```

## What happens, step by step
1. Parse the JSON body (so we can read the email).
2. **Rate limiter** checks: has this `IP + email` tried too often?
3. Too many? Reply `429`.
4. Otherwise run the normal login handler.

## What you get back
Everything login returns, plus:
| Status | Meaning |
|---|---|
| `429` | Too many attempts. Wait for `Retry-After` |

## Key ideas
- **Brute-force attack** = a robot trying thousands of passwords. Limiting attempts makes that useless.
- The limit key is `IP + email`, so an attacker can't lock out other people.
- **Middleware order matters here:** the body must be parsed *first*, because the limiter reads the email from it.
- We **reuse** the login handler instead of copy-pasting it.

## 🧠 Remember
> Brute force needs many guesses. Limit the guesses.
