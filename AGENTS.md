# AGENTS.md

High-signal guidance for OpenCode sessions in this repo.

## Repo shape and entrypoints
- Runtime app is `web/` (React Router v7 SSR + Vite + TS strict + Supabase).
- Root `package.json` is not the app command source of truth; use `web/package.json` scripts.
- App shell starts in `web/app/root.tsx`; route table is manually maintained in `web/app/routes.ts`.
- Path aliases `~/` and `@/` both resolve to `web/app` (`web/tsconfig.json`).

## Setup and environment
- First-time local setup: copy `web/.env.template` to `web/.env.local`, then run Supabase locally and fill keys from `supabase status -o json`.
- Local app/test base URL is `http://localhost:5173`.
- `ONBOARDING_MODE` defaults to role-based behavior (`role` unless explicitly set to `permission` in server env).
- Keep `SUPABASE_SECRET_KEY` server-only; never expose it in client code or loader data.

## Commands (run from `web/`)
- Install deps: `npm install`
- Dev server: `npm run dev`
- Type gate (required before handoff): `npm run typecheck` (`react-router typegen && tsc`)
- Build/serve: `npm run build` then `npm run start`
- Tests: `npm run test` (Playwright over `tests/`)
- Scoped tests: `npm run test:e2e`, `npm run test:unit`

## Playwright quirks and focused runs
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173`.
- Single e2e file: `npm run test:e2e -- tests/e2e/guardian-signup-enroll.spec.ts`
- File + title filter: `npm run test:e2e -- tests/e2e/guardian-signup-enroll.spec.ts --grep "guardian signs up"`
- Title-only filter: `npm run test:e2e -- --grep "guardian signs up, completes pre-program survey, and enrolls"`

## Supabase workflow
- Start local services from repo root: `supabase start --debug`; inspect keys/status with `supabase status -o json`.
- Create migrations with CLI (`supabase migration new <name>`); do not hand-create or rename versions in `supabase/migrations/`.
- Do not edit already-committed migrations; add a new forward-fix migration instead.
- Typical schema flow: edit `supabase/schemas/*.sql` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate DB types: `supabase gen types typescript --local > web/app/lib/database.types.ts`.

## Generated files and auth/session gotchas
- Never manually edit generated router types in `web/.react-router/types/`.
- Route modules commonly import generated `./+types/*`; rerun `npm run typecheck` after route changes.
- Server auth helpers (`web/app/lib/supabase/server.ts`) return `headers`; preserve/pass these headers on auth redirects/responses or sessions can break.
- Email templates under `supabase/templates/` are inline-styled HTML; keep styles inline (no `<style>` blocks).
