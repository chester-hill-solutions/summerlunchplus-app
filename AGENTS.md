# AGENTS.md

## Scope
- Treat `repo/` as the working root. Main services: `web/` (React Router SSR app), `scheduler/` (cron runner), `zoom-api/` (FastAPI service).
- Run commands from each service directory unless a command explicitly targets repo root.
- Root `package.json` has no scripts (dependency-only), so do not run `npm run ...` at repo root.

## High-value command map
- `web/`: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- `scheduler/`: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.
- `zoom-api/`: `make setup`, `make dev`, `make test`.
- CI (`.github/workflows/tests.yml`) runs only `web` Playwright tests (Node 22) and starts local Supabase first.

## Web app (`web/`)
- There is no lint script in `web/package.json`; do not invent `npm run lint`.
- Routing is manual: adding a route file is not enough; register it in `web/app/routes.ts` or you will ship a 404.
- After route edits, run `npm run typecheck` (it runs `react-router typegen` and refreshes `web/.react-router/types`).
- Keep auth headers on redirects/responses: `createClient(request)` returns `{ supabase, headers }` and redirects should pass `headers`.
- Staff-visible `/manage/*` access is enforced by `TEAM_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`.
- `ONBOARDING_MODE` is role mode unless the value is exactly `permission`.

## Web tests (Playwright only)
- `npm run test` uses Playwright (`web/tests`); no Vitest/Jest setup exists.
- Run one spec with `npm run test -- tests/e2e/<file>.spec.ts` (or `tests/unit/<file>.spec.ts`).
- `test:e2e` and `test:unit` are directory shortcuts, not single-file wrappers.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173`.
- Some admin-oriented specs intentionally skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set.

## Supabase workflow
- Follow repo convention from `CODE_STANDARDS.md`: edit `supabase/schemas/*.sql`; do not hand-edit existing `supabase/migrations/*.sql`.
- Schema change order (repo root): edit schema -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema edits:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- Local seed mode in `supabase/config.toml` uses sanitized prod snapshot + app-data bootstrap (`./seeds/prod-data/active/*-sanitized.sql`, `./seeds/app-data/*.sql`).
- API row cap is `api.max_rows = 1000`; large reads must batch/paginate.

## Scheduler (`scheduler/`)
- Schedule source of truth is `scheduler/crontab` (deployed via `scheduler/railway.toml`).
- `make` targets require `scheduler/.env.local`; at minimum set `APP_BASE_URL` and `INTERNAL_RUNNER_SECRET`.
- Cron-to-web auth uses `x-internal-runner-secret`; its value must match `web`'s `INTERNAL_RUNNER_SECRET`.

## Zoom API (`zoom-api/`)
- Read `zoom-api/CLAUDE.md` before changing this service.
- `make setup` installs runtime deps only (`requirements.txt`), not pytest/dev tooling.
- Keep auth implemented via FastAPI `HTTPBearer` in `zoom-api/app/auth.py`; `zoom-api/tests/test_main.py::test_openapi_declares_security_scheme` guards this.

## Generated artifacts
- Do not edit generated outputs directly: `web/build/**` and `web/.react-router/types/**`.
