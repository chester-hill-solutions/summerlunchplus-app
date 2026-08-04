# AGENTS.md

## Scope
- Use `repo/` as the working root. Its deployable services are `web/` (React Router SSR), `scheduler/` (Docker cron runner), and `zoom-api/` (FastAPI).
- Run service commands from that service directory. The root `package.json` is dependency-only and defines no scripts.

## Web (`web/`)
- Use `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, and `npm run test`; there is no lint script.
- Routes are manual: register each new `app/routes` file in `app/routes.ts`, then run `npm run typecheck` to regenerate React Router types.
- `createClient(request)` returns response cookie headers. Pass `headers` to redirects and responses so Supabase session changes persist.
- Add staff-visible `/manage/*` pages to `TEAM_ALLOWED_MANAGE_PATHS` in `app/routes/manage/team.tsx`; route registration alone does not grant team access.
- `ONBOARDING_MODE` is `role` unless its value is exactly `permission`.
- Tests use Playwright only. Run one spec with `npm run test -- tests/e2e/<file>.spec.ts` or `tests/unit/<file>.spec.ts`; `test:e2e` and `test:unit` only target their directories.
- Without `PLAYWRIGHT_BASE_URL`, Playwright starts `npm run dev -- --port 5173`. Admin setup specs skip without `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- Do not edit generated `build/**` or `.react-router/types/**`.

## Supabase
- Change declarative SQL in `supabase/schemas/`, not existing `supabase/migrations/`. From the repo root: `supabase db diff -f <name>`, then `supabase migration up`; commit the schema and generated migration together.
- Schema changes require regenerated `web/app/lib/database.types.ts`:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- New user-facing tables need RLS and policies. New app permissions must be mapped in `role_permission` for at least admin and manager, or RLS will deny them.
- Local seeds use the sanitized production snapshot and app bootstrap (`supabase/config.toml`); the API caps responses at 1,000 rows, so batch large reads.

## Scheduler (`scheduler/`)
- `crontab` is the schedule source of truth and Railway runs it through `railway.toml`.
- Copy `.env.template` to `.env.local` before `make cron`, `make cron-bg`, or `make smoke-all`; set `APP_BASE_URL` and `INTERNAL_RUNNER_SECRET`.
- Cron calls use `x-internal-runner-secret`; it must equal the web service's `INTERNAL_RUNNER_SECRET`.

## Zoom API (`zoom-api/`)
- Read and follow `zoom-api/CLAUDE.md` before changing this service.
- `make setup` installs only `requirements.txt`; install `requirements-dev.txt` before `make test` on a fresh environment.
- Keep API-key auth on FastAPI `HTTPBearer` in `app/auth.py`; `tests/test_main.py::test_openapi_declares_security_scheme` protects the OpenAPI security scheme.

## CI
- `.github/workflows/tests.yml` runs only web Playwright tests on Node 22 after starting local Supabase; it does not run a separate lint or typecheck job.
