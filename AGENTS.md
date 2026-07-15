# AGENTS.md

## Repo shape
- Monorepo with 3 deployables: `web/` (React Router v7 SSR), `scheduler/` (cron container), `zoom-api/` (FastAPI).
- Run commands in the relevant subdirectory. Root `package.json` has no scripts.
- CI (`.github/workflows/tests.yml`) covers only `web` Playwright tests with local Supabase.

## Web (`web/`)
- Core commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint script; do not invent `npm run lint`.
- Routes are manually registered in `web/app/routes.ts`; new route files are ignored until added there.
- After editing `web/app/routes.ts`, run `npm run typecheck` (this regenerates `.react-router/types`).
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; preserve/pass `headers` on redirects and responses or auth cookies break.
- `ONBOARDING_MODE` falls back to `role` unless value is exactly `permission` (`web/app/lib/auth.server.ts`).

## Web testing
- Playwright is the only JS test runner (`npm run test` runs both `tests/e2e` and `tests/unit`).
- Focused runs: `npm run test:e2e -- tests/e2e/<file>.spec.ts` and `npm run test:unit -- tests/unit/<file>.spec.ts`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173`.
- Admin setup specs auto-skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set (env or `web/.env.local`).

## Supabase + DB
- Treat `supabase/schemas/*.sql` as schema source of truth; keep `supabase/migrations/*.sql` generated from schema changes.
- Standard flow from repo root: edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB TS types after schema edits:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- `supabase/config.toml` sets `api.max_rows = 1000`; server queries over large sets must batch/paginate.
- `supabase/config.toml` seed mode is sanitized prod snapshot + app seeds (`supabase/seeds/prod-data/active/*-sanitized.sql`, then `supabase/seeds/app-data/*.sql`).
- Follow `CODE_STANDARDS.md` for DB/auth conventions (permissions + RLS + metadata rules are enforced by team practice).

## Scheduler (`scheduler/`)
- Schedule source of truth: `scheduler/crontab`.
- `INTERNAL_RUNNER_SECRET` must match the `web` service secret used by `/internal/*` routes.
- Local ops: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.

## Zoom API (`zoom-api/`)
- Read and follow `zoom-api/CLAUDE.md` before editing this service.
- Preferred commands: `make setup`, `make dev`, `make test`.
- `make setup` installs runtime deps only; install dev deps (`pip install -r requirements-dev.txt`) before tests in a fresh venv.
- Keep auth in `zoom-api/app/auth.py` based on `HTTPBearer`; `zoom-api/tests/test_main.py::test_openapi_declares_security_scheme` enforces this.
