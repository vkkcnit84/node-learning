# POST /auth/login — "Log in"

📄 Code: [login.js](login.js)

## In one line
Checks your email and password, then gives you two tokens (like a pass and a renewal ticket).

## Real-life analogy
A hotel front desk. You show your ID once, and they hand you:
- 🎫 a **room key card** that works for 15 minutes (*access token*)
- 🎟️ a **renewal voucher** to get a new key card later (*refresh token*)

## What you send
```json
{ "email": "a@acme.com", "password": "password123" }
```

## What happens, step by step
1. Find the user by email.
2. Scramble the typed password and compare it with the saved one.
3. If it doesn't match, reply with an error.
4. If it matches, create both tokens and send them.

## What you get back
```json
{ "accessToken": "eyJ...", "refreshToken": "9f3a...", "expiresIn": 900 }
```
| Status | Meaning |
|---|---|
| `200` | Logged in |
| `401` | Wrong email **or** wrong password |

## Key ideas
- **Access token** is a JWT (a signed note saying who you are). It expires in **15 minutes**, so a stolen one is short-lived.
- **Refresh token** is a random string. We save only its hash, so if the database leaks, nobody can use it.
- **Same error for both mistakes.** We say "Invalid email or password", never "email not found". That stops attackers from discovering which emails exist.

## 🧠 Remember
> Short-lived pass + long-lived renewal ticket. Never reveal which half was wrong.
