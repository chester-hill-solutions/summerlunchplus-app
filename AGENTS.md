# AGENTS.md

## Repo shape
- Monorepo with 3 deployables: `web/` (React Router v7 SSR), `scheduler/` (cron container), `zoom-api/` (FastAPI).
- Run commands in the relevant subdirectory; root `package.json` has dependencies but no runnable scripts.

## Web (`web/`)
- Core commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- No lint script exists; do not run or add `npm run lint` as a default check.
- Routes are manually wired in `web/app/routes.ts`; adding a route file alone will 404.
- After editing `web/app/routes.ts`, run `npm run typecheck` to regenerate `.react-router/types`.
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; forward `headers` in redirects/responses or auth cookies are lost.
- `ONBOARDING_MODE` is role-based unless env is exactly `permission` (`web/app/lib/auth.server.ts`).
- Staff manage access is path-allowlisted in `TEAM_ALLOWED_MANAGE_PATHS` (`web/app/routes/manage/team.tsx`); new `/manage/*` routes may be blocked for staff until added.

## Web tests
- Playwright is the only test runner here (`npm run test` over `web/tests`).
- Focused runs: `npm run test:e2e -- tests/e2e/<file>.spec.ts` and `npm run test:unit -- tests/unit/<file>.spec.ts`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts `npm run dev -- --port 5173` automatically (`web/playwright.config.ts`).
- Some admin setup specs skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are present.

## Supabase / DB
- Source of truth is declarative SQL in `supabase/schemas/`; migrations are generated from schema changes (see `CODE_STANDARDS.md`).
- Standard flow from repo root: edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema changes:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- `supabase/config.toml` sets `api.max_rows = 1000`; any broad server query must batch or paginate.
- Local seed mode is sanitized prod snapshot + app seeds (`supabase/seeds/prod-data/active/*-sanitized.sql` then `supabase/seeds/app-data/*.sql`).

## Scheduler (`scheduler/`)
- Cron schedule source of truth: `scheduler/crontab`.
- `INTERNAL_RUNNER_SECRET` must match the `web` secret used by `/internal/*` routes.
- Local ops from `scheduler/`: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.

## Zoom API (`zoom-api/`)
- Read `zoom-api/CLAUDE.md` before editing; it contains required workflow and auth checks.
- Use Make targets: `make setup`, `make dev`, `make test`.
- `make setup` installs runtime deps only; install `requirements-dev.txt` before running tests in a fresh venv.
- Auth must stay on `HTTPBearer` in `app/auth.py`; `tests/test_main.py::test_openapi_declares_security_scheme` enforces OpenAPI security wiring.
