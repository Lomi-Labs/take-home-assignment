# Backend: rules for agents

Covers `apps/api`, `apps/worker`, `packages/core`, `packages/adapters`, `packages/db`, `packages/contracts`.

Express 5 · BullMQ 5 on Redis 8 · Prisma 7 + `@prisma/adapter-pg` · Postgres 17 · Gemini (`@google/genai`) · unpdf ·
zod · pino · Vitest. Local Postgres in Docker for dev and tests; Supabase is only a deploy target. No Supabase SDK.

## Architecture: modules in core, adapters at the edges, thin apps

A modular monolith split across packages. Business rules live once, in `packages/core`, and both the API (HTTP) and the
worker (queue) call the same services. Anything external (LLM, PDF parsing, queue, clock) sits behind a port in core and
is implemented in `packages/adapters`, so tests swap in fakes. Plain layering inside a module, no domain-object mapping
of every Prisma row.

```
packages/core/src/
├── modules/
│   ├── documents/          upload, new version, supersede, retry, list, progress
│   │   ├── service.ts      use cases and business rules; owns the transaction
│   │   ├── repository.ts   every query on this module's tables
│   │   ├── ports.ts        interfaces for what it needs from outside (JobQueue)
│   │   ├── errors.ts       this module's AppError subclasses
│   │   ├── constants.ts    limits, magic numbers
│   │   ├── mappers.ts      Prisma row -> contracts type
│   │   └── index.ts        the module's public surface; other code imports only this
│   ├── extraction/         claim, parse, prompt, validate, fenced commit, reconcile
│   │   ├── service.ts
│   │   ├── repository.ts
│   │   ├── ports.ts        LlmClient, PdfParser, Clock
│   │   ├── prompt.ts       system prompt + response schema (pure)
│   │   ├── validate.ts     evidence + value checks -> value or gap (pure)
│   │   ├── normalise.ts    per-type normalisers, also used for corrections (pure)
│   │   ├── diff.ts         carry-over classification (pure)
│   │   └── ...             errors.ts, constants.ts, index.ts
│   └── reviews/            approve / correct, review state, copying reviews on carry-over
└── shared/
    ├── app-error.ts        AppError(code, status, detail)
    ├── db.ts               DbClient type (client or transaction), withTx helper
    └── actor.ts            SYSTEM_USER_ID re-export, Actor type

packages/adapters/src/
├── gemini/llm-client.ts    LlmClient on @google/genai (structured output, temperature 0, timeout)
├── unpdf/pdf-parser.ts     PdfParser on unpdf
├── bullmq/job-queue.ts     JobQueue producer (jobId = versionId)
└── fakes/                  FakeLlmClient (scripted responses), InMemoryJobQueue, FixedClock. Tests only.

packages/db/
├── prisma/schema.prisma    snake_case via @map / @@map, audit columns on every model
├── prisma/migrations/      generated + hand-written SQL (partial uniques, updated_at trigger)
├── prisma.config.ts
└── src/
    ├── client.ts           createDb(url): PrismaClient + adapter-pg + soft-delete extension
    └── seed.ts             idempotent: v1 of each fixture from fixtures/documents.json, status queued

packages/contracts/src/
├── documents.ts / values.ts / reviews.ts   zod request + response schemas, inferred types
├── fields.ts               expected fields per doc type (from fixtures/expected-fields.json) + descriptions
├── errors.ts               ErrorCode union + ApiErrorBody schema
└── constants.ts            SYSTEM_USER_ID, statuses, limits shared with the UI

apps/api/src/
├── main.ts                 load config, build container, listen, graceful shutdown. Nothing else.
├── app.ts                  createApp(container): json, request id, pino-http, routers, 404, error handler
├── config.ts               zod-parsed env, one getConfig()
├── container.ts            composition root: db client + adapters -> core services
├── middleware/             validate.ts (zod), upload.ts (multer, memory, size limit), error-handler.ts
└── routes/                 documents.router.ts, values.router.ts. HTTP only: parse -> call service -> send

apps/worker/src/
├── main.ts                 config, container, start Worker + reconciler interval, graceful shutdown
├── config.ts / container.ts
├── extract.job.ts          BullMQ processor: one call to extraction service, never throws back to BullMQ
└── reconciler.ts           requeue expired leases, re-add every queued version, give up after MAX_ATTEMPTS
```

### Dependency rules (what may import what)

- `routes` → core services (from `container`), `contracts`, `middleware`. Routers never touch Prisma, repositories or
  adapters.
- `service` → its `repository`, `ports`, `errors`, `constants`, other modules' `index.ts`. Services never import
  express, bullmq, `@google/genai`, unpdf or `Request`/`Response`. They throw `AppError`s, never send responses.
- `repository` → `@app/db` types + the client it is given. The only layer that builds queries.
- `adapters` → the port interface they implement + their library. Wired only in `container.ts`, never imported by core.
- Cross-module: call the other module's service through its `index.ts`. Never import another module's repository.
- Pure files (`prompt.ts`, `validate.ts`, `normalise.ts`, `diff.ts`) import nothing with IO.

### Adding a feature

Create only the files it needs, in this order: Prisma model → migration → contracts schema → `repository.ts` →
`ports.ts` (if it talks to something external) → `service.ts` → adapter (if any) → wire in `container.ts` → router →
tests.

## Data and database

- Primary keys: UUID (`@default(uuid()) @db.Uuid`). Exception: `document.id` is text so seeds can keep the manifest ids
  (`doc-invoice-001`).
- Audit columns on every table, declared the same way on every model (Prisma has no mixins, so copy the block exactly):

  | Column | Type | Set by |
    | --- | --- | --- |
  | `created_at` | `TIMESTAMPTZ NOT NULL` | DB default `now()` |
  | `created_by` | `UUID NOT NULL` | DB default `SYSTEM_USER_ID`; services pass the actor |
  | `updated_at` | `TIMESTAMPTZ NOT NULL` | Prisma `@updatedAt` + the `set_updated_at` trigger (covers raw SQL) |
  | `updated_by` | `UUID NOT NULL` | service, on every update (raw SQL too) |
  | `deleted_at` | `TIMESTAMPTZ NULL` | service, on soft delete |
  | `deleted_by` | `UUID NULL` | service, on soft delete |

- No users table yet: every `*_by` is `SYSTEM_USER_ID` (`00000000-0000-0000-0000-000000000000`) and has no foreign key.
  Repository write methods still take an `actorId` so adding auth later is a wiring change, not a refactor.
- Soft delete sets `deleted_at` and `deleted_by` together. Nothing is hard-deleted. The client extension in
  `packages/db` filters `deleted_at IS NULL` on reads by default; opting out must be explicit and commented.
- Uniques that matter for correctness are partial indexes on live rows (`WHERE deleted_at IS NULL`), in SQL migrations.
- Timestamps are `timestamptz`, always UTC. Never build dates from local time.
- Money and percents are decimal strings (`"5230.29"`), never JS floats. Compare with the normalisers, not `parseFloat`.
- DB names are snake_case through `@map`/`@@map`; TypeScript sees camelCase. Raw SQL uses the snake_case names.
- Sessions/transactions: the service owns the transaction (`db.$transaction(async (tx) => ...)`) and passes `tx` to
  repositories. Repositories never open transactions. One transaction per use case.
- Raw SQL only with the tagged `$queryRaw` / `$executeRaw` templates (parameterised). Never `$queryRawUnsafe` with
  interpolated values.
- Select what you need. Never load `document_version.pdf` unless the use case is parsing it. Never return a Prisma row
  from the API; map it to the contracts type in `mappers.ts`.

## Migrations

- Every schema change is a Prisma migration. Read the generated SQL before committing; it's a draft.
- Partial indexes, triggers and anything Prisma can't express: `migrate dev --create-only`, then add the SQL by hand.
- Renames: Prisma generates drop + add, which loses data. Edit the SQL to `ALTER TABLE ... RENAME`.
- Never drop a column or table without saying so explicitly in the commit and the PR.
- Against Supabase, migrations use the session/direct connection (port 5432), never the transaction pooler.

## Jobs and the queue

- Postgres owns job state (`document_version.status`, `attempts`, `lease_until`, `error`) and the attempt log
  (`extraction_attempt`). BullMQ only delivers `{versionId}`.
- `queue.add('extract', { versionId }, { jobId: versionId, removeOnComplete: true, removeOnFail: true, attempts: 1 })`.
  jobId dedupe is a bonus, never the guarantee.
- A job starts with the conditional claim and uses the returned `attempts` as its fencing token on every write.
- Extend the lease every `LEASE_SECONDS / 3` while waiting on the LLM.
- The processor catches everything: failure is a state (`failed` + error text + attempt row), never a rethrow.
- The reconciler runs on worker boot and every 30 s. It must stay idempotent; it's the answer to restarts and
  `FLUSHALL`.

## LLM

- Only through the `LlmClient` port. Model from `GEMINI_MODEL`, temperature 0, JSON schema structured output, every
  schema field required (absent = null), 60 s timeout, no retries inside the client.
- Store the request and the raw response on the attempt row before validating anything.
- Never trust output: it goes through `validate.ts` (evidence verbatim in `parsed_text` after whitespace
  normalisation, value backed by its evidence). Anything that fails is a gap with a code and reason, never dropped.

## API conventions

- Routes: `POST /documents`, `POST /documents/:id/versions`, `GET /documents`, `GET /documents/:id`,
  `GET /documents/:id/versions`, `GET /documents/:id/progress`, `POST /documents/:id/retry`, `POST /values/:id/review`,
  `GET /health`.
- Status codes are deliberate: 202 accepted for async work, 201 create, 404 not found, 409 conflict (wrong state, old
  version), 413 file too large, 415 not a PDF, 422 validation.
- Every response is parsed through its contracts schema before sending. Never send a Prisma object or an ad-hoc object.
- Errors are always `{"error": "<snake_case_code>", "detail": "<human text>"}` via `AppError(code, status, detail)` and
  the global error handler. Codes live in `contracts/errors.ts` and are part of the API contract; the UI maps them to
  friendly text. Unknown errors become `internal_error` (500) with a generic detail; the real error goes to the log.
- Express 5 forwards rejected promises to the error handler, so routers don't wrap handlers in try/catch.
- Validation: `validate({ params, query, body })` middleware with contracts schemas; failures are 422
  `validation_failed`.

## Security

- Secrets only from env through `config.ts`. `.env` gitignored, `.env.example` current with dummy values.
- pino redacts `authorization`, `*apiKey*`, `GEMINI_API_KEY`, `pdf`, `parsedText`, `prompt`. Never log document text,
  prompts or LLM responses (they're in the attempt table).
- Uploads: multer memory storage, 10 MB limit, `%PDF-` magic bytes checked, original filename never used as a path.
- `helmet` on the API. CORS stays off: the UI calls through the Next.js rewrite (same origin). If it's ever enabled,
  allowlist origins, never `*`.
- Test-only switches default off; the app refuses to start with one on when `NODE_ENV=production`.

## Testing

- Vitest everywhere. `*.test.ts` beside the file for unit tests; `test/integration/` per app for the rest.
- Unit: pure extraction logic (validate, normalise, diff, prompt) and services with fake repositories/ports. Use the
  fixtures' real parsed text and the expected values in `LLD.md`.
- Integration: `apps/api` with supertest against a real local Postgres + Redis (compose `test` profile, separate
  database). Truncate tables between tests. Worker tests run the processor with `FakeLlmClient`.
- Never call Gemini in tests. One optional smoke test runs only when `GEMINI_API_KEY` is set.
- Every endpoint: success + each error code it can return. The guarantees in the brief each get a test (instant upload,
  no duplicate values, failure is a state, restart/flush recovery, supersede, carry-over).

## Code style

- 4-space indent, printWidth 120. Named exports only (no default exports in backend code).
- Explicit return types on exported functions. `async`/`await`, no `.then` chains.
- No `console.log`; use the module's pino child logger.
- Small functions; a service method reads like the use case it implements.

## Gotchas

- Prisma 7: needs `prisma.config.ts`, `@prisma/adapter-pg`, and `import 'dotenv/config'` (it no longer loads `.env`).
- `@updatedAt` only runs through the Prisma client. Raw SQL updates rely on the trigger and must set `updated_by`.
- BullMQ Worker connections need `maxRetriesPerRequest: null`.
- Express 5 path syntax changed: wildcards are named (`/*splat`), optional params use braces.
- Supabase transaction pooler (6543) needs `?pgbouncer=true`; the API and worker use the session pooler (5432).
- `BigInt` doesn't serialise to JSON; don't use it for anything that reaches a response.
