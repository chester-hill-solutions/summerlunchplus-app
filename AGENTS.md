# AGENTS.md

## Repo scope
- Main app is `web/` (React Router v7, SSR enabled). Run Node commands from `web/`; root `package.json` has no scripts.
- `scheduler/` and `zoom-api/` are separate deployables with separate run/test flows.
- Before editing `zoom-api/`, read `zoom-api/CLAUDE.md` and follow it.

## Web routing/auth gotchas
- Routes are manually registered in `web/app/routes.ts`; adding only a route file still 404s.
- After route changes, run `npm run typecheck` in `web/` (`react-router typegen && tsc`) to refresh generated route types.
- `web/app/root.tsx` has an allowlist-based onboarding redirect guard; new public/auth paths must be added there.
- Keep onboarding behavior aligned across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`.
- Signup details route is `/auth/sign-up-details` (hyphenated).
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; pass `headers` through redirects/responses or auth cookies are lost.

## Manage table patterns
- For heavy manage pages, keep the deferred pattern: lightweight page loader + client `fetcher.load()` data request (`web/app/routes/manage/deferred-table-display.tsx`).
- For full-dataset filter UIs (for example `email-message`), use `_deferTable=1`, clear `page`/`pageSize`, and force `sort=__full_scan__`.
- Supabase API row cap is `1000` (`supabase/config.toml`); batch large related reads with stable ordered `.range(...)` loops instead of one large `.in(...)` fetch.

## Local setup and verification
- First-time local setup (repo root): `cp web/.env.template web/.env.local` -> `supabase start --debug` -> copy values from `supabase status -o json` into `web/.env.local`.
- `ONBOARDING_MODE` defaults to `role`; only `permission` enables permission-gated onboarding.
- Key `web/` commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint script in `web/package.json`; do not invent `npm run lint`.
- Focused tests: `npm run test:e2e -- tests/e2e/<spec>.spec.ts --grep "..."` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.

## Test and CI behavior
- `npm run test` in `web/` runs Playwright for both `web/tests/e2e` and `web/tests/unit`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173` (`web/playwright.config.ts`).
- Several admin e2e helpers require `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (env or `web/.env.local`).
- CI (`.github/workflows/tests.yml`) installs deps in `web/`, installs Chromium, starts Supabase, writes `web/.env.local`, and runs only `npm run test` (no typecheck).

## Supabase workflow
- Team convention: treat `supabase/schemas/*.sql` as schema source of truth; do not hand-edit existing `supabase/migrations/*`.
- Schema change flow (repo root): edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate `web/app/lib/database.types.ts`:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- Ship DB features with permission seeds and RLS updates together (`app_permissions`, `role_permission`, policies), as required by `CODE_STANDARDS.md`.
- Authorization source of truth is `public.user_roles` + JWT claims; user metadata role can drift.
- `supabase/config.toml` default seed mode is app bootstrap + sanitized prod snapshot (`./seeds/prod-data/*-sanitized.sql`).

## Scheduler specifics
- `INTERNAL_RUNNER_SECRET` must match between `scheduler` and `web` for internal cron routes.
- Job schedule source of truth is `scheduler/crontab` (zoom, gift-card, export run, export cleanup).
- Scheduler local commands live in `scheduler/Makefile` (`make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`).
- `make smoke-all` runs zoom/export/cleanup scripts; gift-card smoke runs are separate (`scheduler/scripts/gift-card-jobs.sh`).
