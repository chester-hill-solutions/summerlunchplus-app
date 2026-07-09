# AGENTS.md

## Repo boundaries
- Main product is `web/` (React Router v7 SSR). Run Node commands in `web/`; root `package.json` has no scripts.
- `scheduler/` and `zoom-api/` are separate deployables with separate run/test flows.
- When touching `zoom-api/`, read and follow `zoom-api/CLAUDE.md` first.

## Web app wiring that causes regressions
- Routes are manually declared in `web/app/routes.ts`; adding only a route file still 404s.
- After route edits, run `npm run typecheck` in `web/` (`react-router typegen && tsc`) so generated route types refresh.
- `web/app/root.tsx` enforces onboarding redirects for most paths. New public/auth routes must be added to its allowlist.
- Keep onboarding behavior aligned across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`.
- Signup details URL is `/auth/sign-up-details` (hyphenated).
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; pass `headers` through redirects/responses or auth cookies are dropped.
- `~/` and `@/` both map to `web/app/*` (`web/tsconfig.json`).
- For heavy manage tables, use the existing deferred pattern: lightweight page loader + client `fetcher.load()` request (see `web/app/routes/manage/deferred-table-display.tsx`).
- For full-dataset filtering tables (for example `email-message`), use the full-scan loader pattern: set `_deferTable=1`, clear `page`/`pageSize`, and force `sort=__full_scan__`.
- In deferred/manage loaders, always paginate large related-table fetches (`.range(...)` loops with stable `order(...)`) instead of single `.in(...)` reads. PostgREST row caps can silently truncate related rows (for example `class_zoom_registrant`) and produce false UI states.

## Local setup and verification
- Initial local setup (repo root): `cp web/.env.template web/.env.local` -> `supabase start --debug` -> copy values from `supabase status -o json` into `web/.env.local`.
- `ONBOARDING_MODE` defaults to `role`; only `permission` enables permission-gated onboarding.
- Key `web/` commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint script in `web/package.json`; do not invent `npm run lint`.
- Focused runs: `npm run test:e2e -- tests/e2e/<spec>.spec.ts --grep "..."` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.

## Test/CI behavior
- `npm run test` is Playwright for both `web/tests/e2e` and `web/tests/unit`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173` (`web/playwright.config.ts`).
- Admin e2e setup helpers require `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (env or `web/.env.local`).
- CI in `.github/workflows/tests.yml` installs deps in `web/`, boots Supabase, writes `web/.env.local`, and runs only `npm run test` (no typecheck step).

## Database and Supabase workflow
- Source of truth is declarative SQL in `supabase/schemas/`; do not hand-edit existing `supabase/migrations/*`.
- Schema change flow (repo root): edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate `web/app/lib/database.types.ts`:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- Ship DB features with permissions + RLS updates together (`app_permissions`, `role_permission`, policies), as enforced by `CODE_STANDARDS.md`.
- Auth source of truth for authorization is `public.user_roles` + JWT claims; metadata role can drift.
- `supabase/config.toml` seeds with app bootstrap + sanitized prod snapshot by default (`./seeds/prod-data/*-sanitized.sql`).
- Supabase auth email templates are configured in `supabase/config.toml` and loaded from `supabase/templates/*.html`.

## Scheduler and zoom-api gotchas
- Internal cron auth requires matching `INTERNAL_RUNNER_SECRET` in both `scheduler` and `web`.
- Job schedule source of truth is `scheduler/crontab` (currently includes zoom, gift-card, export run, and export cleanup jobs).
- Scheduler local commands are in `scheduler/Makefile` (`make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`).
- In `zoom-api`, auth changes must keep FastAPI `HTTPBearer` and keep `test_openapi_declares_security_scheme` passing (from `zoom-api/CLAUDE.md`).
