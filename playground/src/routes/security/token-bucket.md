# GET /rate-limit/token-bucket — "Slow down!"

📄 Code: [token-bucket.js](token-bucket.js) · Limiter logic: [lib/rate-limit.js](lib/rate-limit.js)

## In one line
Limits how often one person can call this endpoint. Too many calls → `429`.

## Real-life analogy
A bucket of **5 coins**. Every request spends 1 coin. A new coin drops in every **2 seconds**. Empty bucket? Wait.

```
Start:     🪙🪙🪙🪙🪙   (5 coins, you can burst 5 requests)
After 5:   (empty)      → request #6 gets 429
2s later:  🪙           → one more request allowed
```

## What happens, step by step
1. Find this client's bucket (one per IP address).
2. Add the coins earned since the last request (up to max 5).
3. Have at least 1 coin? Spend it and continue ✅
4. Empty? Reply `429` with `Retry-After` (seconds to wait) ❌

## What you get back
| Status | Meaning |
|---|---|
| `200` | Allowed. `RateLimit-Remaining` header shows coins left |
| `429` | Too many requests. `Retry-After` says when to retry |

## Key ideas
- **Why rate limit?** To stop spam, abuse and brute-force attacks.
- Token bucket allows a **short burst** but keeps the **average** speed in check.
- No timer needed. We compute the coins earned from the time elapsed since the last request.
- Buckets live in memory (a `Map`). That's fine for one server. With several servers, use **Redis** so they share the count.

## Try it
```sh
for i in $(seq 1 7); do curl -si localhost:3000/rate-limit/token-bucket | head -1; done
```
The first 5 give `200`, then `429`.

## 🧠 Remember
> Bucket of coins: burst allowed, then you wait.
