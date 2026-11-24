# TypeScript in Production Node.js

## Q1. Types vanish at runtime. How do you keep an API type-safe end to end?

### 1. Interview Question
"TypeScript types are erased at compile time. How do you make sure request data, DB rows and third-party responses are actually valid?"

### 2. Simple Explanation
TypeScript checks **your code**, not the **data coming in**. Anything crossing a boundary (HTTP body, env vars, queue message, DB row, LLM output) is `unknown` until validated at runtime. Use a schema library (Zod/Valibot) as the **single source of truth** and infer the static type from it.

### 3. Real-World Scenario
A partner sends `amount` as a string `"100"`. Code typed as `number` does `amount + 1` → `"1001"`. A runtime schema would have rejected or coerced it at the edge.

### 4. How to Implement
1. Define schemas once; `z.infer<typeof Schema>` for types.
2. Validate at every trust boundary (middleware for HTTP, parse queue messages, parse env at startup).
3. Prefer `unknown` over `any`; narrow with schemas/type guards.
4. Use `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
5. Use discriminated unions for states; exhaustive `never` checks.

### 5. Code Example
```ts
import { z } from 'zod';
import type { RequestHandler } from 'express';

export const CreateBooking = z.object({
  customerId: z.number().int().positive(),
  items: z.array(z.object({ sku: z.string().min(1), qty: z.number().int().min(1) })).min(1),
  currency: z.enum(['USD', 'EUR', 'INR']),
});
export type CreateBooking = z.infer<typeof CreateBooking>;

export const validate =
  <T extends z.ZodTypeAny>(schema: T): RequestHandler =>
  (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) return res.status(400).json({ error: r.error.flatten() });
    req.body = r.data;                // now trustworthy
    next();
  };

// Discriminated union + exhaustiveness
type Payment =
  | { kind: 'card'; last4: string }
  | { kind: 'bank'; iban: string };
function describe(p: Payment): string {
  switch (p.kind) {
    case 'card': return `card •••• ${p.last4}`;
    case 'bank': return `bank ${p.iban}`;
    default: { const _x: never = p; return _x; }   // compile error if a case is added and not handled
  }
}

// Validated env, fail fast on boot
export const env = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
}).parse(process.env);
```

### 6. Trade-offs
| Option | Pro | Con |
|---|---|---|
| Zod schemas as source of truth | One definition, runtime + static | Runtime cost, bundle size |
| Hand-written interfaces only | Zero runtime cost | Lies at the boundary |
| Codegen from OpenAPI/DB (Prisma, kysely-codegen) | Types track contract | Build step, generated code |
| ORM vs query builder vs raw SQL | ORM: speed of dev; builder (Kysely): typed SQL, control | ORM can hide bad queries |

### 7. Common Mistakes
- `as SomeType` casts and `any` hiding bugs; trusting `JSON.parse` output.
- Interfaces that drift from the real DB/API.
- `strict` turned off "temporarily" forever.
- Over-clever generics nobody can read; types as a substitute for tests.

### 8. Interview Answer
"I treat every boundary as `unknown` and validate with Zod, then infer types from the schema so there's one source of truth. I run `strict` with `noUncheckedIndexedAccess`, model states as discriminated unions with exhaustive checks, validate env at boot, and avoid `any` and `as` casts. Types catch our mistakes; schemas catch the outside world's."

### 9. Follow-up Questions
- `unknown` vs `any` vs `never`?
- `type` vs `interface`?
- How do you share types between frontend and backend (monorepo package, OpenAPI, tRPC)?
- What do `satisfies`, `readonly`, branded types give you (e.g. `UserId` vs `BookingId`)?

---

## Q2. How do you structure and tool a TypeScript Node service for a team?

### 1. Interview Question
"How do you set up a TypeScript backend so a team can move fast without it becoming a mess?"

### 2. Simple Explanation
Make the **right thing the easy thing**: strict compiler, linting, formatting, tests, and CI gates, with a layered structure (routes → services → repositories) and dependency injection by plain functions/constructors for testability.

### 3. Real-World Scenario
New engineers add endpoints that talk to the DB directly from handlers, making them untestable. A `service` layer with an injected `repo` fixes it.

### 4. How to Implement
1. `tsconfig`: `strict`, `module: NodeNext`, `target: ES2022`, `isolatedModules`.
2. Run with `tsx` in dev; build with `tsc`/`tsup`/`esbuild` for prod; use source maps (`--enable-source-maps`).
3. ESLint (`typescript-eslint`, `no-floating-promises`, `no-misused-promises`) + Prettier.
4. Tests with Vitest/Jest; typecheck in CI (`tsc --noEmit`).
5. Typed errors (`AppError` with `code`, `status`), central error middleware.

### 5. Code Example
```ts
// service depends on an interface → trivially mockable
export interface BookingRepo { insert(b: NewBooking): Promise<Booking>; }
export class BookingService {
  constructor(private readonly repo: BookingRepo, private readonly clock = () => new Date()) {}
  async create(input: CreateBooking): Promise<Booking> {
    // business rules here, no HTTP, no SQL
    return this.repo.insert({ ...input, createdAt: this.clock() });
  }
}
```
```jsonc
// tsconfig.json (core)
{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true,
  "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022",
  "outDir": "dist", "sourceMap": true, "skipLibCheck": true } }
```

### 6. Trade-offs
| Choice | Pro | Con |
|---|---|---|
| DI container (NestJS/tsyringe) | Structure, conventions | Magic, learning curve |
| Manual DI | Simple, explicit | Wiring boilerplate |
| NestJS vs Express/Fastify | Opinionated, scales with team | Heavier; Fastify/Express more flexible |

### 7. Common Mistakes
- Floating promises (unhandled rejections).
- Business logic inside controllers; circular imports.
- Skipping `tsc --noEmit` in CI because "the bundler compiles it".
- Production stack traces pointing at compiled JS (no source maps).

### 8. Interview Answer
"Strict TypeScript, ESLint rules that catch floating promises, a layered structure with services depending on interfaces so they're unit-testable, typed domain errors with a central handler, and CI that runs typecheck, lint and tests. I'd pick Fastify or NestJS depending on team size, but the principles are the same."

### 9. Follow-up Questions
- Why is `no-floating-promises` important in Node?
- Type-only imports and ESM/CJS interop pitfalls?
- How do you type Express `req`/`res` extensions safely?
