# AGENTS.md

## Repo layout
- Monorepo with 3 deployables: `web/` (React Router v7 SSR), `scheduler/` (cron container), `zoom-api/` (FastAPI).
- Run commands inside each service directory; root `package.json` has no scripts.

## Web (`web/`)
- Canonical commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint script; do not assume `npm run lint` exists.
- Local app bootstrap depends on local Supabase: run `supabase start --debug` from repo root and sync `web/.env.local` from `supabase status -o json` values.
- Route files are not auto-registered: add new routes in `web/app/routes.ts`.
- After changing `web/app/routes.ts`, run `npm run typecheck` (runs `react-router typegen` and updates `.react-router/types`).
- `createClient(request)` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; include `headers` in redirects/responses or auth cookies will be dropped.
- Staff access under `/manage/*` is allowlisted in `TEAM_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`; add paths there when introducing new staff-visible manage pages.
- `ONBOARDING_MODE` is role-based unless env is exactly `permission` (`web/app/lib/auth.server.ts`).

## Web tests (Playwright only)
- `npm run test` runs Playwright across `web/tests` (there is no Vitest/Jest).
- Run one spec with `npm run test -- tests/e2e/<file>.spec.ts` (or `tests/unit/<file>.spec.ts`).
- `npm run test:e2e` and `npm run test:unit` are directory-scoped wrappers, not single-file shortcuts.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173` (`web/playwright.config.ts`).
- Admin setup specs skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set (env vars or `web/.env.local`).
- CI (`.github/workflows/tests.yml`) runs only web Playwright tests on Node 22 and bootstraps local Supabase first.

## Supabase and DB workflow
- Source of truth is declarative SQL in `supabase/schemas/`; do not hand-edit existing files in `supabase/migrations/`.
- Schema change flow (repo root): edit `supabase/schemas/*.sql` -> `supabase db diff -f <name>` -> `supabase migration up`.
- After schema changes, regenerate TS DB types:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- `supabase/config.toml` sets `api.max_rows = 1000`; large reads must paginate/batch.
- Local reset seed mode is currently `./seeds/prod-data/active/*-sanitized.sql` + `./seeds/app-data/*.sql` (not dummy fixtures).

## Scheduler (`scheduler/`)
- Schedule source of truth is `scheduler/crontab`.
- Local runner requires `.env.local`; `make` targets fail fast if it is missing.
- `INTERNAL_RUNNER_SECRET` must match `web` for `/internal/*` endpoints.
- Common local commands: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.

## Zoom API (`zoom-api/`)
- Read `zoom-api/CLAUDE.md` before edits for service-specific constraints.
- Use `make setup`, `make dev`, `make test`.
- `make setup` installs only `requirements.txt`; install `requirements-dev.txt` before tests in a fresh venv.
- Keep auth on FastAPI `HTTPBearer` in `app/auth.py`; `tests/test_main.py::test_openapi_declares_security_scheme` enforces OpenAPI security wiring.
