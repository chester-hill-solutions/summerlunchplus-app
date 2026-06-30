# AGENTS.md

## Repo boundaries
- Product app is `web/` (React Router v7 SSR + Vite + TypeScript + Supabase). Run Node commands in `web/`, not repo root (`repo/package.json` has no scripts).
- `zoom-api/` is a separate FastAPI service; follow `zoom-api/CLAUDE.md` when working there.
- `scheduler/` is a separate cron service that triggers `web` internal routes; treat it as its own deployable.

## High-signal wiring details
- Routes are manually declared in `web/app/routes.ts`; new route files 404 until added there.
- Auth/onboarding flow is split across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`; keep redirect logic consistent across all three.
- Signup details path is `/auth/sign-up-details` (not `/auth/signup-details`).
- `web/app/lib/supabase/server.ts#createClient` returns `{ supabase, headers }`; forward `headers` on redirects/responses or auth cookies are dropped.
- `~/` and `@/` both map to `web/app/*` (`web/tsconfig.json`).

## Local setup and commands
- Initial app env: from repo root run `cp web/.env.template web/.env.local`, then `supabase start --debug`, then copy values from `supabase status -o json` into `web/.env.local`.
- `ONBOARDING_MODE` defaults to `role`; only `permission` enables permission-gated onboarding (`web/.env.template`, `web/app/lib/auth.server.ts`).
- App commands (in `web/`): `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- Focused Playwright runs: `npm run test:e2e -- tests/e2e/<spec>.spec.ts --grep "..."` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.

## Testing quirks
- `npm run test` is Playwright for both e2e and unit directories (`web/package.json`); there is no separate Jest/Vitest suite.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts `npm run dev -- --port 5173` automatically (`web/playwright.config.ts`).
- Some admin e2e specs skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are available (env or `web/.env.local`) (`web/tests/e2e/helpers/admin-account.ts`).

## Database workflow and guardrails
- Declarative SQL in `supabase/schemas/` is source of truth. Do not manually edit existing `supabase/migrations/*`.
- Schema change flow (repo root): edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema changes:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- New DB-backed features must include permission seeds (`app_permissions`/`role_permission`) and RLS updates in the same change (`CODE_STANDARDS.md`).
- Use `public.user_roles` + JWT claims as auth truth; `auth.users.raw_user_meta_data.role` can drift.

## Service integration gotchas
- `scheduler` auth depends on matching `INTERNAL_RUNNER_SECRET` between `scheduler` and `web` (`scheduler/README.md`, `web/app/lib/internal-runner-auth.server.ts`).
- Default Supabase seed mode is app bootstrap + sanitized prod snapshot (`supabase/config.toml` uses `./seeds/prod-data/*-sanitized.sql`, not dummy fixtures).
- Auth email templates are configured in `supabase/config.toml` and loaded from `supabase/templates/*.html`.
