# Repository Instructions

## Communication
- Always use ASD-STE100 Simplified Technical English.
- Use short, direct sections and actionable steps. Assume the reader has ADHD: make priorities, decisions, and next actions easy to scan.

## Services
- The deployable services are `web/` (React Router SSR), `scheduler/` (Docker cron runner), and `zoom-api/` (FastAPI). Run service commands from that service directory; the root `package.json` has dependencies only and no scripts.
- `zoom-api/CLAUDE.md` is additional service-specific guidance and must be read before changing that service.

## Web (`web/`)
- Local setup: copy `web/.env.template` to `web/.env.local`, run `supabase start --debug` from the repository root, then use `supabase status -o json` to fill the local Supabase keys. Start with `npm run dev`.
- Install and verify with `npm ci`, `npm run typecheck`, `npm run build && npm run start`, and `npm run test`; there is no lint script.
- Routes are registered manually in `web/app/routes.ts`. After adding a route file, register it there and run `npm run typecheck` to regenerate React Router types.
- Server `createClient(request)` returns cookie `headers`; include them in responses and redirects or Supabase session changes will not persist.
- A staff-visible `/manage/*` route also needs its path in `TEAM_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`; route registration alone is insufficient.
- `ONBOARDING_MODE` uses `role` unless its value is exactly `permission`.
- Playwright starts `npm run dev -- --port 5173` when `PLAYWRIGHT_BASE_URL` is unset, but it does not provision Supabase or `.env.local`. Run a focused spec with `npm run test -- tests/e2e/<file>.spec.ts` or `npm run test -- tests/unit/<file>.spec.ts`; admin setup tests need `SUPABASE_URL` and `SUPABASE_SECRET_KEY` and otherwise skip.
- Do not edit generated `web/build/**` or `web/.react-router/types/**`.

## Supabase
- Declarative SQL in `supabase/schemas/` is the schema source of truth. Do not hand-edit existing `supabase/migrations/`; generate and apply changes from the root with `supabase db diff -f <name>` followed by `supabase migration up`, and keep the schema and generated migration together.
- After schema changes regenerate `web/app/lib/database.types.ts` with `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`; use generated enums/constants rather than duplicate strings.
- New user-facing tables require RLS and policies. New permissions must be added to `app_permissions`, mapped in `role_permission` for at least admin and manager, and enforced through `authorize(...)` or requests will be denied.
- Local `supabase db reset` uses the sanitized production snapshot plus bootstrap seeds by default (`supabase/config.toml`). Never commit raw production snapshots; Supabase API results are capped at 1,000 rows, so batch large reads.

## Scheduler (`scheduler/`)
- `scheduler/crontab` is the schedule source of truth; Railway starts it through `scheduler/railway.toml`. It currently includes Zoom, gift-card, post-program survey, inventory-alert, export, and export-cleanup jobs.
- Copy `scheduler/.env.template` to `.env.local` before `make cron`, `make cron-bg`, or `make smoke-all`; set `APP_BASE_URL` and make `INTERNAL_RUNNER_SECRET` match the web service.
- Internal cron requests authenticate with `x-internal-runner-secret`. `make smoke-all` runs the five smoke targets in the Makefile and does not cover the scheduled inventory-alert job.

## Zoom API (`zoom-api/`)
- `make setup` installs only `requirements.txt`; install `requirements-dev.txt` before `make test` in a fresh environment. Use `make dev` to run locally and `make test` for `pytest tests/ -v`.
- API-key auth must remain FastAPI `HTTPBearer` in `app/auth.py`, not a raw header parameter; `tests/test_main.py::test_openapi_declares_security_scheme` protects the Swagger security scheme.

## CI
- `.github/workflows/tests.yml` runs only the web Playwright suite on Node 22 after starting local Supabase; it has no separate lint or typecheck job.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
