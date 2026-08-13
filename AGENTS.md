# Repository Instructions

## Scope
- The deployable services are `web/` (React Router SSR), `scheduler/` (Docker cron runner), and `zoom-api/` (FastAPI). Run each service's commands from its directory; the root `package.json` has dependencies only and no scripts.
- For local web development, copy `web/.env.template` to `web/.env.local`, run `supabase start --debug` from the root, and use `supabase status -o json` for the local keys.

## Web (`web/`)
- Use `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, and `npm run test`; there is no lint script.
- Routes are manual: register every new `app/routes` file in `app/routes.ts`, then run `npm run typecheck` to regenerate React Router types.
- `createClient(request)` returns cookie response headers. Include its `headers` in redirects and responses so Supabase session changes persist.
- Add staff-visible `/manage/*` pages to `TEAM_ALLOWED_MANAGE_PATHS` in `app/routes/manage/team.tsx`; route registration alone does not grant staff access.
- `ONBOARDING_MODE` is `role` unless its value is exactly `permission`.
- Tests are Playwright only. Run one spec with `npm run test -- tests/e2e/<file>.spec.ts` or `npm run test -- tests/unit/<file>.spec.ts`; `test:e2e` and `test:unit` only target their respective directories.
- Without `PLAYWRIGHT_BASE_URL`, Playwright starts `npm run dev -- --port 5173`, but it does not provision Supabase or `web/.env.local`. Admin setup specs skip unless `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set.
- Do not edit generated `build/**` or `.react-router/types/**`.

## Supabase
- The source of truth is declarative SQL in `supabase/schemas/`; do not hand-edit existing `supabase/migrations/`. From the root, generate and apply changes with `supabase db diff -f <name>` then `supabase migration up`; commit the schema source and generated migration together.
- Schema changes require regenerating `web/app/lib/database.types.ts`: `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`. Use its generated enums/constants instead of duplicating enum strings in web code.
- New user-facing tables need RLS and policies. New app permissions must be added to `app_permissions`, mapped in `role_permission` for at least admin and manager, and used by RLS through `authorize(...)` or expected requests will be denied.
- PostgreSQL types and policies do not support `IF NOT EXISTS`; omit it from declarative schema files.
- `supabase/config.toml` defaults local resets to sanitized production snapshot data plus bootstrap seeds. Do not commit raw production snapshots; the API response cap is 1,000 rows, so batch large reads.

## Scheduler (`scheduler/`)
- `crontab` is the schedule source of truth; Railway runs it via `railway.toml`.
- Copy `.env.template` to `.env.local` before `make cron`, `make cron-bg`, or `make smoke-all`, and set `APP_BASE_URL` plus `INTERNAL_RUNNER_SECRET`.
- Cron requests use `x-internal-runner-secret`; it must match the web service's `INTERNAL_RUNNER_SECRET`.

## Zoom API (`zoom-api/`)
- Read and follow `zoom-api/CLAUDE.md` before changing this service.
- `make setup` installs only `requirements.txt`; install `requirements-dev.txt` before `make test` in a fresh environment.
- Keep API-key auth on FastAPI `HTTPBearer` in `app/auth.py`; `tests/test_main.py::test_openapi_declares_security_scheme` protects Swagger's security scheme.

## CI
- `.github/workflows/tests.yml` runs web Playwright tests on Node 22 after starting local Supabase; CI has no separate lint or typecheck job.
