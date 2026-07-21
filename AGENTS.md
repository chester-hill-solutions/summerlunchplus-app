# AGENTS.md

## Scope and layout
- Treat `repo/` as the project root. It is a multi-service repo: `web/` (React Router SSR), `scheduler/` (cron container), `zoom-api/` (FastAPI).
- Run commands inside the service folder; root `package.json` has dependencies only and no scripts.

## Web (`web/`)
- Use these scripts: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- Do not assume lint tooling exists here (`web/package.json` has no `lint` script).
- Local boot requires Supabase running from repo root: `supabase start --debug`, then write `web/.env.local` from `supabase status -o json` values.
- Routing is manual: add entries in `web/app/routes.ts` for every new route file, then run `npm run typecheck` (this runs `react-router typegen` and refreshes `.react-router/types`).
- Keep auth cookie headers on redirects/responses: `createClient(request)` returns `{ supabase, headers }` in `web/app/lib/supabase/server.ts`.
- Staff-visible `/manage/*` routes are allowlisted in `TEAM_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`.
- `ONBOARDING_MODE` defaults to role behavior; only exact value `permission` enables permission mode (`web/app/lib/auth.server.ts`).

## Web tests (Playwright)
- `npm run test` runs Playwright only (`web/tests`); there is no Vitest/Jest setup.
- Run one spec with `npm run test -- tests/e2e/<file>.spec.ts` (or `tests/unit/<file>.spec.ts`).
- `test:e2e` and `test:unit` are directory wrappers, not single-file helpers.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts `npm run dev -- --port 5173` automatically (`web/playwright.config.ts`).
- Some admin setup specs skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set.
- CI (`.github/workflows/tests.yml`) runs only web Playwright tests on Node 22 and starts local Supabase first.

## Supabase workflow
- Follow declarative schema workflow: edit `supabase/schemas/*.sql`; do not hand-edit existing `supabase/migrations/*`.
- Schema change order (repo root): edit schema -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema updates:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- Local seed mode in `supabase/config.toml` is prod snapshot + app bootstrap (`./seeds/prod-data/active/*-sanitized.sql`, `./seeds/app-data/*.sql`), not dummy seeds.
- PostgREST row cap is `api.max_rows = 1000`; loaders/queries must batch or paginate large reads.

## Scheduler (`scheduler/`)
- Schedule source of truth is `scheduler/crontab`; deploy uses `scheduler/railway.toml`.
- `make` targets require `.env.local` (`APP_BASE_URL`, `INTERNAL_RUNNER_SECRET`) and fail fast if missing.
- Secret handshake is header `x-internal-runner-secret`; the value must match web's `INTERNAL_RUNNER_SECRET`.
- Useful commands: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.

## Zoom API (`zoom-api/`)
- Read `zoom-api/CLAUDE.md` before making zoom-api changes.
- Canonical commands: `make setup`, `make dev`, `make test`.
- `make setup` installs runtime deps only; install dev test deps separately in fresh envs.
- Keep auth implemented with FastAPI `HTTPBearer` in `app/auth.py`; `tests/test_main.py::test_openapi_declares_security_scheme` enforces OpenAPI security wiring.
