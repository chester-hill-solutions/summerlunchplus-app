# AGENTS.md

## Repo boundaries
- Main product is `web/` (React Router v7 SSR + Vite + TypeScript + Supabase); run app Node commands in `web/`.
- Root `package.json` has dependencies only (no scripts); do not assume root-level app tasks.
- `zoom-api/` is a separate Python FastAPI service; follow `zoom-api/CLAUDE.md` for work in that subtree.

## App wiring that is easy to miss
- Routes are declared manually in `web/app/routes.ts`; creating a route file without registration still 404s.
- Auth/onboarding guard logic is split between `web/app/root.tsx` and `web/app/lib/auth.server.ts`.
- `~/` and `@/` both alias to `web/app/*` (`web/tsconfig.json`).
- `createClient()` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; always forward `headers` on redirect/response writes or auth cookies break.
- Do not edit generated router types in `web/.react-router/types/`.

## Local setup and env
- Bootstrap local env from repo root: `cp web/.env.template web/.env.local`.
- Start Supabase from repo root: `supabase start --debug`, then copy `supabase status -o json` values into `web/.env.local`.
- `web/.env.template` defaults `ONBOARDING_MODE=role`; only `permission` enables permission-gated onboarding behavior.
- Keep `SUPABASE_SECRET_KEY` server-only (for example `web/app/lib/supabase/adminClient.ts`), never exposed from loaders/client code.
- `supabase/config.toml` seeds app + sanitized prod snapshot by default (`./seeds/prod-data/*-sanitized.sql`), not dummy fixtures.

## Commands and focused verification
- Install deps in app workspace: `npm ci` (run in `web/`).
- Dev server: `npm run dev`.
- Typecheck + route type generation: `npm run typecheck`.
- Build smoke test: `npm run build && npm run start`.
- Full test run: `npm run test`.
- Focused e2e: `npm run test:e2e -- tests/e2e/guardian-signup-enroll.spec.ts --grep "..."`.
- Unit subset uses Playwright too: `npm run test:unit`.

## Test quirks
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173` (`web/playwright.config.ts`).
- Admin e2e helpers require `SUPABASE_URL` + `SUPABASE_SECRET_KEY` (process env or `web/.env.local`); those tests skip when missing.

## Database and auth conventions
- Treat declarative SQL in `supabase/schemas/` as source of truth; do not hand-edit existing `supabase/migrations/*`.
- Schema flow (repo root): edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate DB types:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- New features/tables must ship with `app_permissions`, `role_permission` seed updates, and RLS policy updates in the same change.
- Treat JWT claims and `public.user_roles` as auth truth; `auth.users.raw_user_meta_data.role` can drift.

## Known failure modes
- Correct signup details route is `/auth/sign-up-details`; `/auth/signup-details` is wrong.
- Keep onboarding completion logic aligned between `enforceOnboardingGuard` and `web/app/routes/auth/sign-up-details.tsx` to avoid redirect loops.
- In manage loaders, prefer `public.profile` lookups by `user_id` over `auth.users` for display fields.
- Batch large Supabase `.in(...)` lookup lists to avoid gateway/fetch failures on production-sized data.
- Auth email templates are configured in `supabase/config.toml` and loaded from `supabase/templates/*.html`.
