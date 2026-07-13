# AGENTS.md

## Repo Boundaries
- Three deployables live in one repo: `web/` (React Router v7 SSR app), `scheduler/` (cron runner), `zoom-api/` (FastAPI service).
- Run commands in the package directory; repo-root `package.json` has no scripts.
- Before changing `zoom-api/`, read and follow `zoom-api/CLAUDE.md` (it has stricter workflow + auth checks).

## Local Git Workflow (this clone)
- Treat `main` as read-only.
- Use `sai/<topic>` branches, with worktrees under `/Users/saihaansyed/chs/prj/summerlunchplus-app/worktrees/`.
- Rebase order when landing work: update `sai/main` (`git pull --rebase`) -> rebase `sai/<topic>` onto `sai/main` -> fast-forward `sai/main`.

## Web (`web/`)
- Primary commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint script; do not run `npm run lint`.
- Routes are manually registered in `web/app/routes.ts`; adding only a route file causes 404s.
- After touching `web/app/routes.ts`, run `npm run typecheck` to regenerate `.react-router/types`.
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; propagate `headers` on redirects/responses or auth cookies are dropped.
- Onboarding/auth behavior is split across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`; change them together.
- Staff `/manage` access is exact-path allowlisted in `STAFF_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`.
- `ONBOARDING_MODE` defaults to `role`; only literal `permission` enables permission-gated mode.

## Web Tests
- Playwright is the only test runner here (`npm run test` runs `web/tests` unit + e2e together).
- Focused runs: `npm run test:e2e -- tests/e2e/<spec>.spec.ts` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173`.
- Some admin e2e specs skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set (env or `web/.env.local`).

## Supabase / DB Flow
- First local boot (from repo root): `cp web/.env.template web/.env.local` -> `supabase start --debug` -> fill env values from `supabase status -o json`.
- Treat `supabase/schemas/*.sql` as source of truth; do not hand-edit existing generated files in `supabase/migrations/`.
- Standard schema change flow: edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema changes:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- Local seeds are configured to sanitized prod snapshot + app seeds in `supabase/config.toml`.
- Supabase API row cap is `1000` (`supabase/config.toml`), so batch large reads.
- `CODE_STANDARDS.md` is the DB/auth convention source of truth.

## Scheduler (`scheduler/`)
- Cron schedule source of truth: `scheduler/crontab`.
- `INTERNAL_RUNNER_SECRET` must match values used by `web` internal routes.
- Main local commands: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.
- `make smoke-all` runs zoom/export/cleanup smoke scripts; gift-card smoke is separate (`scheduler/scripts/gift-card-jobs.sh`).

## Zoom API (`zoom-api/`)
- Use Make targets: `make setup`, `make dev`, `make test` (these use `.venv/bin/...`).
- `zoom-api/.venv/` exists in this repo; scope searches to `zoom-api/app/` and `zoom-api/tests/` when possible.
