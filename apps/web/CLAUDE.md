# Frontend: rules for agents

Next.js 16 (App Router) · React 19 · TypeScript strict · TanStack Query 5 · CSS Modules · Vitest + Testing Library ·
Playwright. A desktop-first review tool that must still work on a tablet-width window. It only talks to the API, through
the `/api` rewrite.

## Commands

- Dev against the real API: `pnpm --filter web dev` (needs the api running, `API_URL` defaults to
  `http://localhost:4000`)
- Dev fully mocked (no backend, no Gemini key): `NEXT_PUBLIC_API_MODE=mock pnpm --filter web dev`
- Lint: `pnpm --filter web lint` · Types: `pnpm --filter web typecheck`
- Unit tests: `pnpm --filter web test`
- E2E: `pnpm --filter web e2e --project=mock` (UI states) · `--project=live` (full stack via docker compose)

## Code structure

Every file in `src/app/` is a route, so `src/app/` holds only thin `page.tsx` / `layout.tsx` files that re-export a
module. All real code lives in modules.

```
apps/web/src/
├── app/                          # routing only
│   ├── layout.tsx                # export { default } from '@/modules/root-layout';
│   ├── page.tsx                  # export { default } from '@/modules/documents-list';
│   └── documents/[id]/page.tsx   # export { default } from '@/modules/document-detail';
├── modules/                      # one folder per screen/feature
│   ├── root-layout/              # html shell, fonts, QueryClientProvider
│   ├── documents-list/
│   │   ├── index.tsx             # the screen: UI only
│   │   ├── hooks.ts              # all logic and state (useDocumentsList, useUpload)
│   │   ├── constants.ts          # copy, error-code -> text map, poll interval
│   │   ├── styles.module.css
│   │   └── components/
│   │       └── upload-dialog/    # same files again, nested as deep as needed
│   └── document-detail/
│       ├── index.tsx
│       ├── hooks.ts              # useDocument (polling), useReview, useNewVersion, useRetry
│       ├── constants.ts
│       ├── styles.module.css
│       └── components/           # value-row, gap-row, evidence-panel, previous-review, correct-form,
│                                 # version-banner, version-history
├── components/                   # shared, generic: button, badge, status-badge, progress-bar, dialog,
│                                 # empty-state, error-state, spinner (same folder-per-component layout)
├── hooks/                        # shared hooks (use-poll-interval, use-media-query)
├── styles/                       # tokens.css (CSS variables), globals.css
├── lib/                          # format.ts (money, dates, percents), highlight.ts (evidence spans)
└── services/                     # all network and data access; screens never fetch directly
    ├── index.ts                  # exports `api`: live or mock, picked once from NEXT_PUBLIC_API_MODE
    ├── http.ts                   # fetch wrapper: base '/api', JSON, parses with contracts, throws ApiError
    ├── api-error.ts              # ApiError(code, status, detail), thrown by live AND mock
    ├── query-keys.ts             # every TanStack Query key in one place
    ├── mock/
    │   ├── db.ts                 # in-memory store (localStorage-backed), reset()
    │   └── control.ts            # scenario + latency switches, exposed as window.__mock
    ├── documents/                # one folder per backend area, same four files each time
    │   ├── types.ts              # re-exports types from @app/contracts + the DocumentsApi interface
    │   ├── api.ts                # live implementation (calls http.ts)
    │   ├── mock.ts               # mock implementation over mock/db
    │   └── fixtures.ts           # typed fixtures + named scenarios per endpoint
    └── values/                   # review endpoint, same four files
```

- Each component gets its own kebab-case folder with `index.tsx`, and that file holds no logic. Logic goes in
  `hooks.ts`, constants in `constants.ts`, styles in `styles.module.css`. Create only the files a component needs.
- A component split into pieces keeps them in a `components/` folder inside its own folder, recursively.
- Modules and their hooks are client components (`'use client'` at the top of `index.tsx` and `hooks.ts`).
  Server components are only the route files and `root-layout`. Screens read route params with `useParams()`.
- Import with the `@/` alias (maps to `src/`) and `@app/contracts`. Never deep relative paths across modules.
- Named exports everywhere except the default export of a screen (`modules/*/index.tsx`) that a route re-exports.

## What the UI must show

There are no designs; the brief is the spec. A reviewer should know what needs attention within five seconds.

- List: every document with status, current version and review progress (pending / approved / corrected / carried
  over / gaps). Documents needing attention sort first. Upload a new document (type + file) from here.
- Detail, in this order: anything pending first (changed values, then gaps, then new values), then carried over and
  approved/corrected, collapsible.
- Each value row: field name, value, its quote, status badge, Approve / Correct. Correct takes a value and an optional
  note.
- Gaps are always visible with their reason, never hidden behind a toggle.
- After a re-extraction: carried-over rows are visibly different from newly pending ones. Changed rows show the previous
  value and its review beside the new one.
- A document text panel shows the version's parsed text with the selected value's quote highlighted (`evidenceSpan`).
- Every state is built, not just the happy path: loading, empty list, queued / extracting (with a spinner),
  failed (error + Retry), extracted, "v3 extracting…" banner while a newer version is running, superseded versions in
  the history, API errors.
- Don't invent features the brief doesn't ask for (no auth screens, no editing documents, no settings).

## Styling

- Tokens only from `src/styles/tokens.css` (CSS variables: colours, spacing, radius, font sizes, shadows). Component
  CSS uses `var(--…)`, never raw hex or ad-hoc pixel values; numbers that only one component needs go in its
  `constants.ts` or as a local custom property.
- Status colours are semantic tokens (`--status-pending`, `--status-approved`, `--status-corrected`,
  `--status-carried`, `--status-gap`, `--status-failed`) and every status also has a text label (never colour only).
- Font: Geist through `next/font`. Light theme is enough; respect `prefers-color-scheme` only if it's free.
- No UI kit. If a primitive is genuinely needed (dialog, popover), use a headless library (Radix) and style it with
  tokens.
- Inline `style` only for truly dynamic values.

## API, data and errors

- Hooks call `api.<area>.<method>()` from `@/services` through TanStack Query (`useQuery`, `useMutation`). They never
  import `api.ts`, `mock.ts` or `http.ts` directly, so they can't tell live from mock.
- Live HTTP goes only through `services/http.ts`, base `/api`. `next.config.ts` rewrites `/api/:path*` to `API_URL`
  (server-side env). Nothing else calls `fetch`.
- Types come straight from `@app/contracts` (shared zod schemas). No codegen; if the backend contract changes, `tsc`
  fails in both `api.ts` and `mock.ts`. `http.ts` parses every response with its contracts schema.
- Polling: `refetchInterval` returns 2000 while any visible document is `queued` or `extracting`, otherwise `false`.
- Mutations (review, upload, new version, retry) invalidate the document, the list and the progress keys from
  `query-keys.ts`.
- The API returns errors as `{"error": "<code>", "detail": "..."}`; `http.ts` throws `ApiError(code, status, detail)`.
  Each module's `constants.ts` maps codes to friendly text. Never show raw server text to users.

## Mocks and test data

One switch runs the whole UI without a backend: `NEXT_PUBLIC_API_MODE=mock` (default `live`). `services/index.ts` reads
it once and exports either every area's `api.ts` or every area's `mock.ts`, imported lazily so mock code never ships in
a live build.

- `fixtures.ts` mirrors the expected results in `LLD.md`: the three seeded docs, the market report's
  `median_household_income` gap, and invoice v2 producing exactly two pending values and three carried over.
- Mock state is realistic: upload goes queued → extracting → extracted over the configured latency, review writes
  update progress, uploading invoice v2 runs the same carry-over outcome.
- `window.__mock`: `setScenario('documents.upload', 'file_too_large')`, `setScenario('extraction', 'failed')`,
  `setLatency(ms)` (default 300), `reset()`. One named scenario per error code the API can return.
- Keep it small. It exists so UI work and Playwright don't need the backend or a Gemini key.

## Testing

- Every interactive element and every screen state has a `data-testid` (`<module>-<element>`, e.g.
  `document-detail-approve`, `documents-list-row`).
- Unit tests cover hooks and the trickier components (value-row states, highlight) against the module's `mock.ts`
  and `fixtures.ts`; never hand-roll a different fake.
- E2E specs live in `e2e/*.spec.ts`, each naming the brief requirement it proves. Two Playwright projects: `mock`
  (every state and error code via `window.__mock`, `reset()` in `beforeEach`) and `live` (the full upload → extract →
  review → v2 → carry-over flow against docker compose).
- Check layouts at 1440x900, 1280x800, 1024x768 and 768x1024.

## Responsive layout

- Desktop first. Detail is two panes (values left, document text right) at >= 1024 px and stacks below that.
- Fonts, paddings, radii and buttons keep fixed sizes; only containers respond (columns, pane widths, max content
  width from tokens).

## Gotchas

- Anything with hooks, Query or `window` needs `'use client'`. Keep the QueryClient in `root-layout`'s client provider.
- `next.config.ts` needs `transpilePackages: ['@app/contracts']`.
- Only `NEXT_PUBLIC_API_MODE` is public. `API_URL` is server-only (used by the rewrite). Never put a secret in a
  `NEXT_PUBLIC_` variable.
- Don't use Next.js route handlers or server actions for app data; the API is the Express service.
- `evidenceSpan` offsets are into the raw `parsedText`; highlight on the raw string, never on a trimmed or normalised
  copy.

## Code style

- 4-space indent, printWidth 120. Components are function components named in PascalCase, in kebab-case folders.

## Hygiene

- No trash: when a change makes a component, style, token or dependency unused, delete it in the same commit.
- Keep `.next/`, `playwright-report/`, `test-results/` and `.DS_Store` out of git.
