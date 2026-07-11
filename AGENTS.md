# AGENTS.md

## Scope
- Main app is `web/` (React Router v7, SSR). Run Node commands from `web/`; root `package.json` has no scripts.
- `scheduler/` and `zoom-api/` are separate deployables with separate run/test flows.
- Before touching `zoom-api/`, read and follow `zoom-api/CLAUDE.md`.

## Local setup and core commands
- First-time setup (repo root): `cp web/.env.template web/.env.local` -> `supabase start --debug` -> copy values from `supabase status -o json` into `web/.env.local`.
- Key `web/` commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint script in `web/package.json`; do not invent `npm run lint`.
- `ONBOARDING_MODE` defaults to `role`; only `permission` enables permission-gated onboarding.

## Routing and auth traps (web)
- Routes are manually declared in `web/app/routes.ts`; a new route file alone will still 404.
- After changing routes, run `npm run typecheck` in `web/` to regenerate React Router types.
- `web/app/root.tsx` enforces onboarding redirects with an allowlist; add any new public/auth path there.
- Keep onboarding flow changes aligned across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`.
- Signup details route is exactly `/auth/sign-up-details`.
- `createClient` from `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; include `headers` in redirects/responses or auth cookies are dropped.

## Manage table conventions
- Prefer server-side query mode for manage tables so filter options remain correct across pagination/sorting.
- Prefer deferred table pages: lightweight shell loader + `DeferredTableDisplay` + route-level `*.table-data.ts` loader that sets `_deferTable=1`.
- For CSV exports, use `/manage/exports` form posts with `intent=create-export`, `export_type`, and `source_path`.
- For full-dataset filter option scans (for example `email-message`), remove `page`/`pageSize` and force `sort=__full_scan__` in the deferred loader request.
- Supabase API `max_rows` is `1000` (`supabase/config.toml`); batch large reads with stable ordered `.range(...)` loops.

## Tests and CI
- `npm run test` in `web/` runs Playwright across both `web/tests/e2e` and `web/tests/unit`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173`.
- Some admin e2e helpers require `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (env or `web/.env.local`).
- Focused runs: `npm run test:e2e -- tests/e2e/<spec>.spec.ts --grep "..."` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.
- CI (`.github/workflows/tests.yml`) installs deps in `web/`, installs Chromium, starts Supabase, writes `web/.env.local`, then runs `npm run test` only (no typecheck).

## Supabase workflow
- Treat `supabase/schemas/*.sql` as source of truth; do not hand-edit existing `supabase/migrations/*`.
- Schema flow (repo root): edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate `web/app/lib/database.types.ts` with:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- Ship schema changes with permission seeds + RLS updates together (`app_permissions`, `role_permission`, policies), per `CODE_STANDARDS.md`.
- Authorization source of truth is `public.user_roles` + JWT claims; user metadata role can drift.
- Default local seed mode in `supabase/config.toml` uses sanitized prod snapshot + app bootstrap (`./seeds/prod-data/*-sanitized.sql`, `./seeds/app-data/*.sql`).

## Scheduler specifics
- `INTERNAL_RUNNER_SECRET` must match between `scheduler` and `web` for internal cron routes.
- Cron schedule source of truth is `scheduler/crontab` (zoom, gift-card, export run, export cleanup).
- Scheduler local commands are in `scheduler/Makefile`: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.
- `make smoke-all` runs zoom/export/cleanup smoke scripts; gift-card smoke is separate (`scheduler/scripts/gift-card-jobs.sh`).
