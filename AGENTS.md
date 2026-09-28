<!-- PRESERVE THIS SECTION DURING /init. Do not remove or rewrite it. -->
## User Communication Rules

- Always use ASD-STE100 Simplified Technical English.
- Always write in short, clear, ADHD-friendly sections with direct next steps.

# Repository Instructions

## Structure

- `web/` is the React Router 7 SSR app; `scheduler/` is the Docker/Supercronic trigger for web internal jobs; `zoom-api/` is the FastAPI Zoom service.
- The root `package.json` has no scripts. Run each package's commands from its own directory.
- Read `CODE_STANDARDS.md` before web or Supabase changes. Read and follow `zoom-api/CLAUDE.md` before Zoom API changes.

## Web Setup And Tests

- Before local web tests: copy `web/.env.template` to `web/.env.local`; copy `.env.template` to `.env` and set `SITE_URL`; run `supabase start --debug` from the root; then use `supabase status -o json` to fill the local Supabase keys.
- From `web/`: use `npm ci`, `npm run typecheck`, and `npm run test`. There is no lint script. Run a focused test with `npm run test -- tests/e2e/<file>.spec.ts` or `npm run test -- tests/unit/<file>.spec.ts`.
- Playwright starts `npm run dev -- --port 5173` unless `PLAYWRIGHT_BASE_URL` is set. It does not create Supabase or `.env.local`; admin setup tests need `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- Register routes in `web/app/routes.ts`, then run `npm run typecheck` to regenerate router types. Add staff-visible `/manage/*` routes to `TEAM_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`.
- Return the `headers` from `createClient(request)` in responses and redirects so Supabase session changes persist. `ONBOARDING_MODE` uses role onboarding except when exactly `permission`.
- Do not edit generated `web/build/**` or `web/.react-router/types/**`.

## Supabase

- Change declarative SQL in `supabase/schemas/`, not existing `supabase/migrations/`. From the root, run `supabase db diff -f <name>` and `supabase migration up`; commit schema and generated migration together.
- After schema changes, regenerate types: `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- New user-facing tables need RLS and CRUD policies. New permissions need `app_permissions`, `role_permission` seeds for admin and manager, and `authorize(...)` enforcement.
- `supabase db reset` loads the sanitized production snapshot and bootstrap seeds. Do not commit raw production data. API reads are limited to 1,000 rows, so batch large lookups.

## Scheduler

- `scheduler/crontab` is the schedule source of truth; `scheduler/railway.toml` runs it through Supercronic.
- Copy `scheduler/.env.template` to `scheduler/.env.local` before `make cron`, `make cron-bg`, or `make smoke-all`. `APP_BASE_URL` and `INTERNAL_RUNNER_SECRET` must match the web service.
- Internal job routes require `x-internal-runner-secret`. `make smoke-all` covers Zoom, gift-card, post-program-survey, export, and cleanup jobs, but not the scheduled inventory-alert job.

## Zoom API

- Run `make setup`; in a new environment also run `.venv/bin/pip install -r requirements-dev.txt` before `make test`. Use `make dev` or `make test` from `zoom-api/`.
- Keep authentication in `app/auth.py` as FastAPI `HTTPBearer`, not a raw header parameter. Keep `tests/test_main.py::test_openapi_declares_security_scheme` green.

## CI And Graphify

- CI runs only the web Playwright suite on Node 22 after starting local Supabase. It does not run a separate lint or typecheck job.
- For codebase questions, query `graphify-out/graph.json` with `graphify query`, `graphify path`, or `graphify explain` before broad source searches. Do not revert dirty Graphify output; after code changes run `graphify update .`.
