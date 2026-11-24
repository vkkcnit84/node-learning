# POST /auth/register — "Sign up"

📄 Code: [register.js](register.js)

## In one line
Creates a new user account and saves the password safely.

## Real-life analogy
Signing up at a gym. They note your details, but they never write your secret PIN on paper. They store a scrambled version of it.

## What you send
```json
{ "email": "a@acme.com", "password": "password123" }
```
Optional: `role` (`member` or `admin`) and `org` (company name, default `acme`).

## What happens, step by step
1. Check the email looks real (has an `@`).
2. Check the password is at least 8 characters.
3. Check the email isn't already used.
4. **Scramble the password** (hashing) and save the user.
5. Reply with the user info. **The password is never sent back.**

## What you get back
| Status | Meaning |
|---|---|
| `201` | Created 🎉 |
| `422` | Your input was bad (short password, wrong email) |
| `409` | Email already taken |

## Key ideas
- **Hashing = one-way scrambling.** You can turn `password123` into gibberish, but you can't turn gibberish back into `password123`.
- **Salt = random extra text** mixed in before scrambling. Two users with the same password get different gibberish.
- We use **scrypt**, a slow, strong hashing method.
- ⚠️ Letting the user pick their own `role` is **only for this demo**. In real apps, never trust the client to say "I'm an admin".

## 🧠 Remember
> Never store passwords. Store salted hashes.
