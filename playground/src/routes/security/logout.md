# POST /auth/logout — "Log out"

📄 Code: [logout.js](logout.js)

## In one line
Cancels your refresh token so it can't be used again.

## Real-life analogy
Handing the hotel your renewal voucher and saying "cancel it".

## What you send
```json
{ "refreshToken": "9f3a..." }
```

## What happens
1. Delete that token from the saved list.
2. Reply `204` (success, nothing to send back).

## Key ideas
- It always replies `204`, even if the token didn't exist. That's fine and safe, and it doesn't reveal anything.
- ⚠️ **Your 15-minute access token still works until it expires.** The server doesn't keep a list of access tokens, so it can't cancel them. This is the trade-off of JWTs.

## 🧠 Remember
> Logout kills the renewal ticket, not the current key card.
