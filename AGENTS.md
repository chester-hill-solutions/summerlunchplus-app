# AGENTS.md

## Repo Shape
- `web/` is the main app (React Router v7 SSR); run Node/Playwright commands from `web/`.
- `scheduler/` and `zoom-api/` are separate deployables with separate command sets.
- Before editing `zoom-api/`, read `zoom-api/CLAUDE.md` and follow its stricter workflow.

## Git/Worktree Flow
- Treat `main` as read-only; do all work on `sai/<topic>` branches.
- Create all worktrees under `/Users/saihaansyed/chs/prj/summerlunchplus-app/worktrees/`.
- Before rebasing a worktree branch back into `sai/main`, first update `sai/main` with latest changes (`git pull --rebase`) and then rebase the worktree branch onto that updated `sai/main`.
- Required order: (1) rebase `sai/main` to latest, (2) rebase `sai/<topic>` worktree branch onto `sai/main`, (3) fast-forward `sai/main` to `sai/<topic>`.
- After rebasing, fast-forward merge into `sai/main` (no merge commits).

## Commands (Verified)
- Root `package.json` has no scripts; do not run `npm run ...` from repo root.
- Web (`web/`): `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- `web/package.json` has no lint script; do not invent `npm run lint`.
- First local boot (repo root): `cp web/.env.template web/.env.local`, `supabase start --debug`, then fill `web/.env.local` from `supabase status -o json`.

## Web Routing + Auth Gotchas
- Routes are manually declared in `web/app/routes.ts`; adding a route file alone will 404.
- After editing `web/app/routes.ts`, run `npm run typecheck` to regenerate `.react-router/types`.
- Auth/public allowlist and onboarding redirect entrypoint is `web/app/root.tsx` loader.
- Onboarding logic is split across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`; keep them aligned.
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; include `headers` in redirects/responses or auth cookies are lost.
- Staff `/manage` access is exact-path gated by `STAFF_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`; add both UI routes and any data/action endpoints if staff should reach them.
- `ONBOARDING_MODE` defaults to `role`; only literal `permission` enables permission-gated onboarding.

## Tests
- Playwright runs both e2e and unit tests from `web/tests`; `npm run test` runs everything.
- Focused runs: `npm run test:e2e -- tests/e2e/<spec>.spec.ts` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts `npm run dev -- --port 5173` automatically.
- Several admin e2e specs skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set (env or `web/.env.local`).

## Supabase Workflow
- Follow `CODE_STANDARDS.md` for DB/auth conventions.
- Treat `supabase/schemas/*.sql` as schema source of truth; avoid hand-editing existing generated files under `supabase/migrations/`.
- Typical DB flow (repo root): edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate `web/app/lib/database.types.ts` with:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- Current local seed mode (`supabase/config.toml`) uses sanitized prod snapshot + app seeds (`supabase/seeds/prod-data/active/*-sanitized.sql` + `supabase/seeds/app-data/*.sql`).
- Supabase API max rows is `1000` in `supabase/config.toml`; batch large reads.

## Scheduler
- Cron source of truth is `scheduler/crontab`.
- `INTERNAL_RUNNER_SECRET` must match between `scheduler` and `web` internal routes.
- Main local commands from `scheduler/`: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.
- `make smoke-all` runs zoom/export/cleanup only; gift cards are separate (`scheduler/scripts/gift-card-jobs.sh`).

## Zoom API
- Use `zoom-api/Makefile` targets (`make setup`, `make dev`, `make test`) and `.venv/bin/...` commands from `zoom-api/CLAUDE.md`.
- The repo currently contains `zoom-api/.venv/`; scope searches to `zoom-api/app/` and `zoom-api/tests/` to avoid noisy results.
