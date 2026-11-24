// In-memory "database" shared by the auth endpoints. Use a real DB in production.
export const users = new Map();          // email -> user
export const refreshTokens = new Map();  // sha256(token) -> userId
export const INVOICES = [
  { id: 1, org: 'acme', total: 100 }, { id: 2, org: 'acme', total: 250 }, { id: 3, org: 'globex', total: 999 },
];
