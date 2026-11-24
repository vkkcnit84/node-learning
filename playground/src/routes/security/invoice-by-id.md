# GET /auth/invoices/:id — "Only see YOUR company's invoices"

📄 Code: [invoice-by-id.js](invoice-by-id.js)

## In one line
You can only open invoices that belong to your own company (org).

## Real-life analogy
A bank locker room. Having a bank key isn't enough. The locker number must be one of **yours**.

## The data
| Invoice | Company |
|---|---|
| 1, 2 | acme |
| 3 | globex |

If you're from `acme` and ask for invoice `3`, you get **404**.

## What happens, step by step
1. `requireAuth` identifies you and reads your `org` from the token.
2. Search for an invoice with this `id` **and** your `org`.
3. Nothing found? Reply `404`.
4. Found? Send it.

## What you get back
| Status | Meaning |
|---|---|
| `200` | Your invoice |
| `404` | Doesn't exist, **or** isn't yours |
| `401` | Not logged in |

## Key ideas
- This attack is called **IDOR**: a user just changes the number in the URL (`/invoices/3`) to peek at other people's data. It's one of the most common real-world bugs.
- **Why 404 and not 403?** A 403 tells the attacker "invoice 3 exists, you just can't see it". A 404 reveals nothing.
- The `org` comes from the **signed token**, never from something the user types, so they can't fake it.

## 🧠 Remember
> Logged in ≠ allowed to see everything. Always check ownership.
