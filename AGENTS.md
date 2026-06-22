# AGENTS.md

## Repo shape
- Runtime app is `web/` (React Router v7 SSR + Vite + TypeScript + Supabase).
- Run app commands from `web/`; root `package.json` has dependencies only (no scripts).
- Routing is explicit in `web/app/routes.ts` (not filesystem routing).
- App-wide auth/onboarding guard behavior starts in `web/app/root.tsx` and `web/app/lib/auth.server.ts`.
- Path aliases `~/` and `@/` both resolve to `web/app/*` (`web/tsconfig.json`).

## Setup and env
- First-time setup from repo root: `cp web/.env.template web/.env.local`.
- Start local Supabase from repo root: `supabase start --debug`; pull keys via `supabase status -o json` and populate `web/.env.local`.
- Local URL for dev and Playwright defaults: `http://localhost:5173`.
- `ONBOARDING_MODE` defaults to `role` unless explicitly `permission` (`web/app/lib/auth.server.ts`).
- Keep `SUPABASE_SECRET_KEY` server-only; never return it from loaders or client code.

## Commands
- Install deps: `npm ci` in `web/`.
- Dev server: `npm run dev` (in `web/`).
- Typecheck (also regenerates router types): `npm run typecheck`.
- Build/start smoke: `npm run build && npm run start`.
- E2E suite: `npm run test` or `npm run test:e2e`.
- Single spec / grep: `npm run test:e2e -- tests/e2e/guardian-signup-enroll.spec.ts --grep "..."`.
- `npm run test:unit` targets `tests/unit` with `--pass-with-no-tests`; current repo tests live in `web/tests/e2e`.

## Testing quirks
- Playwright auto-starts `npm run dev -- --port 5173` when `PLAYWRIGHT_BASE_URL` is unset (`web/playwright.config.ts`).
- Admin E2E helpers require service-role env (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`), read from process env or `web/.env.local` (`web/tests/e2e/helpers/admin-account.ts`).

## Database workflow
- Source of truth is declarative SQL in `supabase/schemas/` (`CODE_STANDARDS.md`).
- Do not hand-edit existing `supabase/migrations/*`; generate forward migrations from schema changes.
- Typical flow from repo root: edit `supabase/schemas/*` -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema changes:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- New features/tables must ship with `app_permissions` + `role_permission` seeds and RLS policies in the same change.

## High-risk gotchas
- Never edit generated files in `web/.react-router/types/`.
- If you add/move routes under `web/app/routes/**`, also update `web/app/routes.ts` or the route 404s.
- Signup details route is `/auth/sign-up-details` (hyphenated); `/auth/signup-details` does not exist.
- `createClient()` in `web/app/lib/supabase/server.ts` returns `headers`; preserve/pass them on redirects/responses or auth cookies break.
- Keep onboarding completion logic consistent between guard checks and signup-details loader; mismatches can cause redirect loops between `/auth/sign-up-details` and `/home`.
- Email templates are configured in `supabase/config.toml` and rendered from `supabase/templates/*.html`.
