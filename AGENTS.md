# AGENTS.md

## Repo boundaries
- Product app is `web/` (React Router v7 SSR). Run Node commands in `web/`; root `package.json` has dependencies only, no scripts.
- `scheduler/` (cron worker) and `zoom-api/` (FastAPI) are separate deployables with separate run/test flows.
- When touching `zoom-api/`, follow `zoom-api/CLAUDE.md`.

## Web wiring that causes regressions
- Routes are manually declared in `web/app/routes.ts`; new route files 404 until registered.
- `npm run typecheck` runs `react-router typegen` + `tsc`; run it after route edits to refresh generated route types.
- `web/app/root.tsx` enforces onboarding redirects on almost every path; add new public/auth paths to its allowlist or they will be gated.
- Keep onboarding logic aligned across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`.
- Signup details route is `/auth/sign-up-details` (with hyphen).
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; propagate `headers` on redirects/responses or auth cookies are lost.
- `enforceOnboardingGuard` calls `getSignUpDetailsStatus`, which queries `form_submission` + nested `form_answer`; avoid duplicate calls in the same request path.
- Path aliases `~/` and `@/` both resolve to `web/app/*` (`web/tsconfig.json`).

## Local setup and verification
- First-time local app setup (repo root): `cp web/.env.template web/.env.local` -> `supabase start --debug` -> copy values from `supabase status -o json` into `web/.env.local`.
- `ONBOARDING_MODE` falls back to `role`; only `permission` enables permission-gated onboarding.
- Key commands in `web/`: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint/format script in `web/package.json`; do not invent `npm run lint`.
- Focused tests: `npm run test:e2e -- tests/e2e/<spec>.spec.ts --grep "..."` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.
- CI (`.github/workflows/tests.yml`) boots Supabase and runs only `npm run test`; typecheck is not part of CI.

## Test behavior gotchas
- `npm run test` is Playwright over both `web/tests/e2e` and `web/tests/unit`; there is no Jest/Vitest suite.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173`.
- Admin e2e helpers skip/fail without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (env or `web/.env.local`).

## Database and auth guardrails
- Treat declarative SQL in `supabase/schemas/` as source of truth; do not hand-edit existing `supabase/migrations/*`.
- Schema flow (repo root): edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate `web/app/lib/database.types.ts` with:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- DB-backed features must ship permissions + RLS together (`app_permissions`, `role_permission`, policies) per `CODE_STANDARDS.md`.
- Auth truth is `public.user_roles` + JWT claims; `auth.users.raw_user_meta_data.role` can drift.

## Scheduler/Supabase integration gotchas
- Internal cron auth requires matching `INTERNAL_RUNNER_SECRET` in `scheduler` and `web`.
- Scheduler local run uses `make` targets in `scheduler/Makefile` (not npm scripts).
- Job timing source of truth is `scheduler/crontab` (not README text).
- Default seed mode in `supabase/config.toml` uses bootstrap + sanitized prod snapshot (`./seeds/prod-data/*-sanitized.sql`).
- Supabase auth email templates are configured in `supabase/config.toml` and loaded from `supabase/templates/*.html`.
