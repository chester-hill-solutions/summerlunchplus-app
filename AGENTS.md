# AGENTS.md

## Repo shape
- Runtime app lives in `web/` (React Router v7 SSR + Vite + TypeScript + Supabase).
- Use `web/package.json` scripts for app work; root `package.json` has no scripts.
- Routing is explicitly declared in `web/app/routes.ts` (not filesystem auto-routing).
- App shell and auth/onboarding guard wiring start in `web/app/root.tsx`.
- Path aliases `~/` and `@/` both map to `web/app/*` (`web/tsconfig.json`).

## Setup and env
- First-time local setup: `cp web/.env.template web/.env.local` from repo root.
- Start Supabase from repo root: `supabase start --debug`, then pull keys with `supabase status -o json` into `web/.env.local`.
- Local app/test URL is `http://localhost:5173`.
- `ONBOARDING_MODE` resolves to `role` unless explicitly set to `permission` (`web/app/lib/auth.server.ts`).
- `SUPABASE_SECRET_KEY` is service-role only; never expose it to client code or loader-returned data.

## Commands
- Install deps: `npm ci` in `web/` (CI uses `npm ci`; `npm install` is fine for local updates).
- Dev server: `npm run dev` (from `web/`).
- Typecheck gate: `npm run typecheck` (also regenerates React Router types).
- Build/start: `npm run build` then `npm run start` (from `web/`).
- Tests: `npm run test` (Playwright).
- Focused tests: `npm run test:e2e -- tests/e2e/guardian-signup-enroll.spec.ts --grep "..."`.
- `npm run test:unit` currently points to `tests/unit` with `--pass-with-no-tests`; this repo currently only has `tests/e2e/`.

## Database and schema workflow
- Source of truth is declarative SQL in `supabase/schemas/` (see `CODE_STANDARDS.md`).
- Do not manually edit existing files in `supabase/migrations/`; generate forward migrations instead.
- Typical flow from repo root: edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema changes: `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- New tables/features need matching `app_permissions` + `role_permission` seeds and RLS policies in the same change (`CODE_STANDARDS.md`).

## Gotchas that break flows
- Never edit generated router types in `web/.react-router/types/`.
- If you add/move a route file, also update `web/app/routes.ts` or it will 404.
- `createClient()` in `web/app/lib/supabase/server.ts` returns response `headers`; preserve/pass them on redirects and responses to avoid auth session bugs.
- Playwright auto-starts `npm run dev -- --port 5173` when `PLAYWRIGHT_BASE_URL` is unset (`web/playwright.config.ts`).
- Email templates configured in `supabase/config.toml` live under `supabase/templates/` and are inline-HTML templates.
