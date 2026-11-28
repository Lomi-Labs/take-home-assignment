# Doc review app: rules for agents

PDF extraction + human review. Upload a PDF, Gemini pulls out fields with a verbatim quote as evidence, a reviewer
approves or corrects each value, and a new version of a doc carries reviews over when the evidence didn't change.
The brief is `README.md`. Design notes are `HLD.md` and `LLD.md`; read the relevant part before changing behaviour.

pnpm + Turborepo monorepo · TypeScript strict everywhere · Node 22.

Area rules (loaded with this file):

- Backend (`apps/api`, `apps/worker`, `packages/core`, `packages/adapters`, `packages/db`, `packages/contracts`):
  @apps/api/CLAUDE.md
- Frontend (`apps/web`): @apps/web/CLAUDE.md

## Commands

- Setup: `corepack enable` once, then `pnpm install`
- Whole stack, the way reviewers run it: `docker compose up --build` (migrations + seed run automatically)
- Dev with hot reload: `docker compose up -d postgres redis`, then `pnpm dev` (api, worker, web through turbo)
- Everything: `pnpm turbo build` · `pnpm turbo test` · `pnpm turbo lint` · `pnpm turbo typecheck`
- One package: `pnpm --filter api dev` · `pnpm --filter @app/core test`
- DB: `pnpm --filter @app/db migrate:dev --name <what>` · `migrate:deploy` · `seed` · `studio`

## Layout

```
apps/
├── api/            Express 5 HTTP API (thin: routes, validation, error mapping)
├── worker/         BullMQ consumer + reconciler (thin: job wiring)
└── web/            Next.js 16 review UI
packages/
├── contracts/      zod schemas + types for every API request/response, error codes, field defs. Used by api AND web
├── core/           business modules: services, repositories, ports, pure extraction logic
├── adapters/       implementations of core's ports: Gemini, unpdf, BullMQ, plus test fakes
├── db/             Prisma 7 schema, migrations, client factory, seed
├── tsconfig/       shared tsconfig bases
└── eslint-config/  shared flat config
fixtures/           as provided by the brief; read by the seed, never edited
```

## Package boundaries (what may import what)

- `apps/web` → `@app/contracts` only. Never `core`, `adapters` or `db` (they hold server code and secrets).
- `apps/api`, `apps/worker` → `core`, `adapters`, `contracts`, `db` (only to build the client in `container.ts`).
- `core` → `db` (types + the client passed in), `contracts`. Never express, bullmq, @google/genai, unpdf.
- `adapters` → the `core` port they implement + their library.
- `contracts` → zod only. `db` → prisma only.
- pnpm is strict: a package can only import what its own `package.json` lists. Keep it that way, no hoisting hacks.

## Invariants (never break these)

- Postgres is the source of truth for everything a user can see. Redis only carries `{versionId}` messages.
- The API never parses PDFs or calls the LLM. Uploads write one transaction, enqueue after commit, return 202.
- A job writes its results in one transaction behind the fencing check (`status = 'extracting' AND attempts = token`).
- Values are never stored without evidence found verbatim (whitespace-normalised) in that version's `parsed_text`;
  anything else is a gap with a code and reason.
- Nothing is hard-deleted. Reviews are append-only. Old versions stay readable.
- Every table has the audit columns; `*_by` is `SYSTEM_USER_ID` until auth exists.

## Conventions

- Files and folders: kebab-case. Variables/functions: camelCase. Types, classes, React components: PascalCase.
  Constants: UPPER_SNAKE. DB tables/columns: snake_case (Prisma `@map`). Error codes: snake_case strings.
  API JSON: camelCase.
- 4-space indent in all code and config files. Prettier: printWidth 120, double quotes, semicolons, trailing commas.
- Imports: workspace packages by name (`@app/core`), inside an app the `@/` alias. No deep relative paths across
  folders.
- No `any`. zod at every boundary: HTTP input, LLM output, env, API responses.
- Env only through each app's `config.ts`. `.env` is gitignored, `.env.example` lists every key with safe defaults.
  Only `GEMINI_API_KEY` should be needed to run the stack.

## Reuse before building

Check in order: this repo (`packages/*`, shared components) → the framework (Express, Next.js, Prisma, BullMQ,
TanStack Query; read the versioned docs) → a well-maintained library (recent release, typed, widely used) → build it
small. Say why in the commit when adding a dependency.

## Workflow

- Small commits, imperative messages ("add fencing check to commit").
- Before committing: `pnpm turbo lint typecheck test`.
- When a decision changes, update `HLD.md` / `LLD.md` (and the README section on decisions) in the same commit.

## Gotchas

- Prisma is pinned to 7. `pnpm add prisma` would pull 8 (release candidate, different API). Never bump it.
- TypeScript is pinned to 6.0.x: typescript-eslint supports `<6.1`. Don't take TS 7 until it does.
- Dependencies are pinned to exact versions. pnpm 12 refuses very fresh releases (`minimumReleaseAge`) and silently
  adds a `minimumReleaseAgeExclude` block to `pnpm-workspace.yaml`; pick an older patch instead of keeping that block.
- Internal packages export TypeScript source (`exports: ./src/index.ts`), no build step. The api bundles them with
  tsdown (`deps.alwaysBundle`), web through `transpilePackages`. Env vars a build reads must be in turbo's `env` list.
- `create-next-app` refuses a non-empty folder: scaffold `apps/web` in a temp dir and move it in, keeping
  `apps/web/CLAUDE.md`.
- Docker images build from the repo root with `turbo prune <app> --docker`, never from inside `apps/<app>`.
- Redis must run with `--maxmemory-policy noeviction` or BullMQ warns and can lose jobs.

## Hygiene

- No trash: when a change makes a file, export, env var or dependency unused, delete it in the same commit.
- Keep tool output out of git: `node_modules/`, `.turbo/`, `.next/`, `dist/`, `coverage/`, `playwright-report/`,
  `test-results/`, `.DS_Store`, `.env`.
