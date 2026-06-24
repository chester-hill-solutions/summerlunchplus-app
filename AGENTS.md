# AGENTS.md

## Repo boundaries
- Main product lives in `web/` (React Router v7 SSR + Vite + TypeScript + Supabase); run Node commands from `web/`.
- Root `package.json` has shared dependencies only; no root scripts.
- `zoom-api/` is a separate Python FastAPI service with its own workflow (`zoom-api/CLAUDE.md`).

## App wiring that is easy to miss
- Routes are declared manually in `web/app/routes.ts`; adding a route file alone is not enough.
- Auth/onboarding guard entrypoints are `web/app/root.tsx` and `web/app/lib/auth.server.ts`.
- `~/` and `@/` both map to `web/app/*` (`web/tsconfig.json`).
- `createClient()` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; forward `headers` on redirects/responses or auth cookies break.
- Do not edit generated router types in `web/.react-router/types/`.

## Local setup and env
- Initial setup from repo root: `cp web/.env.template web/.env.local`.
- Start Supabase from repo root: `supabase start --debug`; then `supabase status -o json` and copy values into `web/.env.local`.
- Playwright/dev default URL is `http://localhost:5173`.
- `ONBOARDING_MODE` defaults to `role` unless set to `permission` (`web/app/lib/auth.server.ts`).
- Keep `SUPABASE_SECRET_KEY` server-only (never expose from loaders/client code).

## Commands and focused verification
- Install deps: `npm ci` (in `web/`).
- Dev: `npm run dev`.
- Typecheck (also regenerates route types): `npm run typecheck`.
- Build smoke: `npm run build && npm run start`.
- Full Playwright run: `npm run test`.
- Focused e2e: `npm run test:e2e -- tests/e2e/guardian-signup-enroll.spec.ts --grep "..."`.
- Unit subset: `npm run test:unit` (targets `web/tests/unit`).

## Test and CI quirks
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts `npm run dev -- --port 5173` automatically (`web/playwright.config.ts`).
- Admin e2e helpers require service-role env (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`) from process env or `web/.env.local`; related tests skip without them.
- CI (`.github/workflows/tests.yml`) runs: `npm ci` -> Playwright browser install -> `supabase start --debug` -> write `web/.env.local` from `supabase status` -> `npm run test`.

## Database and auth conventions
- Source of truth is declarative SQL in `supabase/schemas/`; do not hand-edit existing `supabase/migrations/*`.
- Schema change flow (repo root): edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate types:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- New features/tables must include `app_permissions`, `role_permission` seed updates, and RLS policies in the same change.
- Treat JWT claims / `public.user_roles` as auth truth; `auth.users.raw_user_meta_data.role` can drift.

## Known failure modes
- Correct signup details route is `/auth/sign-up-details` (hyphenated); `/auth/signup-details` 404s.
- Keep onboarding completion checks aligned between `enforceOnboardingGuard` and `web/app/routes/auth/sign-up-details.tsx` to avoid redirect loops.
- In manage loaders, prefer `public.profile` lookups by `user_id` over `auth.users` for email/name display fields.
- Batch large Supabase `.in(...)` lookup lists to avoid production fetch/gateway failures.
- Email templates are configured in `supabase/config.toml` and stored in `supabase/templates/*.html`.
