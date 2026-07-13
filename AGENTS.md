# AGENTS.md

## Scope
- Primary app is `web/` (React Router v7 SSR). Run Node commands from `web/`; root `package.json` has no scripts.
- `scheduler/` (cron runner) and `zoom-api/` (FastAPI) are separate services with independent tooling.
- Before touching `zoom-api/`, read `zoom-api/CLAUDE.md` and follow its stricter workflow.

## Git/worktree workflow
- Never edit `main` directly; treat it as read-only in local worktrees.
- For worktrees, name branches as `<dev>/<topic>`; for this repo use `sai/<topic>`.
- Keep branch history linear: use rebase workflows (not merge commits) when syncing or integrating.
- Promote changes through `local/sai/main` -> `origin/sai/main`, then open PRs from `origin/sai/main` into `origin/main`.

## Setup and daily commands
- First-time local boot (repo root): `cp web/.env.template web/.env.local` -> `supabase start --debug` -> copy values from `supabase status -o json` into `web/.env.local`.
- Core `web/` commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- Do not run `npm run lint` in `web/` (no lint script exists).
- `ONBOARDING_MODE` defaults to `role`; only explicit `permission` enables permission-gated onboarding behavior.

## Routing and auth gotchas (web)
- Route files are not auto-registered; every route must be added in `web/app/routes.ts` or it 404s.
- After editing `web/app/routes.ts`, run `npm run typecheck` to regenerate `.react-router` types.
- `web/app/root.tsx` has a public/auth allowlist and onboarding redirects; add newly public paths there.
- Keep onboarding logic in sync across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`.
- Signup details route is `/auth/sign-up-details` (not `/sign-up-details`).
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; include `headers` on redirects/responses or auth cookies are lost.
- `web/app/routes/manage/team.tsx` gates staff paths via `TEAM_ALLOWED_MANAGE_PATHS`; when adding an allowed page, include nested async endpoints (`/table-data`, `/enrichment`, etc.) via prefix matching.

## Testing and CI
- `web` tests run via Playwright for both e2e and unit suites (`testDir: ./tests`), so `npm run test` runs both.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts `npm run dev -- --port 5173` automatically.
- Admin e2e helpers skip/fail without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (from env or `web/.env.local`).
- Focused runs: `npm run test:e2e -- tests/e2e/<spec>.spec.ts --grep "..."` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.
- CI (`.github/workflows/tests.yml`) runs only `npm run test` in `web/` after Supabase boot/env generation; it does not run typecheck.

## Supabase and data workflow
- Schema source of truth is `supabase/schemas/*.sql`; do not hand-edit existing `supabase/migrations/*`.
- Migration flow (repo root): edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema changes:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- Keep permissions/RLS in the same change as schema updates (`app_permissions`, `role_permission`, related policies) per `CODE_STANDARDS.md`.
- Auth source of truth is `public.user_roles` + JWT claims; `auth.users.raw_user_meta_data.role` may drift.
- Local seed mode in `supabase/config.toml` currently uses sanitized prod snapshot + app bootstrap: `./seeds/prod-data/active/*-sanitized.sql` and `./seeds/app-data/*.sql`.
- Supabase API row cap is `1000` (`supabase/config.toml`); batch large reads with ordered `.range(...)` loops.

## Scheduler specifics
- `INTERNAL_RUNNER_SECRET` must match between `scheduler` and `web` for `/internal/*` cron routes.
- Cron schedule source of truth is `scheduler/crontab` (zoom, gift-card, export-run, export-cleanup jobs).
- Scheduler commands live in `scheduler/Makefile`: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.
- `make smoke-all` runs zoom/export/cleanup smokes only; gift-card smoke remains separate at `scheduler/scripts/gift-card-jobs.sh`.
