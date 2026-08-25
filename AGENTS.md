<!-- PRESERVE THIS SECTION DURING /init. Do not remove or rewrite it. -->
## User Communication Rules

- Always use ASD-STE100 Simplified Technical English.
- Always write in short, clear, ADHD-friendly sections with direct next steps.

# Repository Instructions

## Structure

- `web/` is the React Router 7 SSR app; `scheduler/` is the Docker/Supercronic job runner; `zoom-api/` is the FastAPI service.
- The root `package.json` has shared dependencies but no scripts. Run web commands from `web/`, scheduler commands from `scheduler/`, and Zoom API commands from `zoom-api/`.
- Read `CODE_STANDARDS.md` for database, authorization, metadata, lookup, route, and UI rules. Read `zoom-api/CLAUDE.md` before changing `zoom-api/`.

## Web

- Setup: copy `web/.env.template` to `web/.env.local`, run `supabase start --debug` from the repo root, then use `supabase status -o json` to populate local Supabase keys. `supabase/config.toml` reads `env(SITE_URL)` and `env(SMTP_API_KEY)`: create the root `.env` from `.env.template` and set `SITE_URL` (CI uses `http://127.0.0.1:5173`).
- Install and verify from `web/`: `npm ci`; `npm run typecheck`; `npm run build && npm run start`; `npm run test`. There is no lint script.
- Focus tests with `npm run test -- tests/e2e/<file>.spec.ts` or `npm run test -- tests/unit/<file>.spec.ts`; use `npm run test:e2e` and `npm run test:unit` for directory scopes.
- Playwright starts `npm run dev -- --port 5173` unless `PLAYWRIGHT_BASE_URL` is set. It does not provision Supabase or `.env.local`; admin setup tests skip without `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- Register every route in `web/app/routes.ts`; after route changes run `npm run typecheck` to regenerate React Router types. A staff-visible `/manage/*` route also needs its path in `TEAM_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`.
- `createClient(request)` returns cookie headers. Include those headers in responses and redirects so Supabase session changes persist.
- `ONBOARDING_MODE` uses role-based onboarding unless its value is exactly `permission`.
- Do not edit generated `web/build/**` or `web/.react-router/types/**`.

## Supabase

- Edit declarative SQL under `supabase/schemas/`; do not hand-edit existing `supabase/migrations/`. From the repo root, generate with `supabase db diff -f <name>`, apply with `supabase migration up`, and commit schema plus generated migration together.
- After schema changes, regenerate `web/app/lib/database.types.ts` with `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
- New user-facing tables need RLS and policies. New permissions need `app_permissions`, `role_permission` mappings for at least admin and manager, and enforcement through `authorize(...)`.
- `supabase db reset` seeds from the sanitized production snapshot and bootstrap SQL by default. Never commit raw production snapshots. Supabase API reads are capped at 1,000 rows; batch large reads.

## Scheduler

- `scheduler/crontab` is the schedule source of truth; `scheduler/railway.toml` starts it with Supercronic.
- Copy `scheduler/.env.template` to `scheduler/.env.local` before `make cron`, `make cron-bg`, or `make smoke-all`. `APP_BASE_URL` and `INTERNAL_RUNNER_SECRET` must match the web service.
- Internal job routes require `x-internal-runner-secret`. `make smoke-all` covers Zoom, gift-card, post-program-survey, export, and export-cleanup jobs, but not the scheduled inventory-alert job.

## Zoom API

- Run `make setup` to create `.venv` and install runtime dependencies; install `requirements-dev.txt` before `make test` in a new environment. Use `make dev` or `make test`.
- Keep auth as FastAPI `HTTPBearer` in `app/auth.py`, not a raw header parameter. `tests/test_main.py::test_openapi_declares_security_scheme` protects the Swagger security scheme.

## CI And Graphify

- CI runs only the web Playwright suite on Node 22 after starting local Supabase; it has no separate lint or typecheck job.
- `graphify-out/graph.json` is the repository knowledge graph. For codebase questions, use `graphify query`, `graphify path`, or `graphify explain` before broad source searches. Do not treat dirty graphify output as a reason to revert work; after code changes run `graphify update .`.
