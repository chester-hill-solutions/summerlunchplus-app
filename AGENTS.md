# AGENTS.md

## Repo shape
- Three deployables share this repo: `web/` (React Router v7 SSR), `scheduler/` (cron container), `zoom-api/` (FastAPI).
- Run commands inside the relevant package; root `package.json` has dependencies only (no scripts).
- CI (`.github/workflows/tests.yml`) only runs `web` Playwright tests (with local Supabase); no scheduler/zoom-api CI job here.

## Web (`web/`)
- Core commands: `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- No lint script exists in `web/package.json`.
- Routing is manually declared in `web/app/routes.ts`; adding a route file without adding it there will 404.
- After editing `web/app/routes.ts`, run `npm run typecheck` to regenerate `.react-router/types`.
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; always pass `headers` through redirects/responses or auth cookies are lost.
- Onboarding/auth flow is coupled across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`.
- `ONBOARDING_MODE` is effectively defaulted to `role` unless exactly `permission`.

## Web tests
- Playwright is the only JS test runner; `npm run test` runs both `web/tests/e2e` and `web/tests/unit`.
- Focused runs: `npm run test:e2e -- tests/e2e/<file>.spec.ts` and `npm run test:unit -- tests/unit/<file>.spec.ts`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright starts `npm run dev -- --port 5173` automatically.
- Several admin e2e specs auto-skip without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (env or `web/.env.local`).

## Supabase + DB
- Schema source of truth is `supabase/schemas/*.sql`; treat `supabase/migrations/*.sql` as generated artifacts.
- Normal schema flow: edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up` (run from repo root).
- Regenerate TS DB types after schema edits:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- `supabase/config.toml` seeds local DB from sanitized prod snapshot + app seeds, and sets API `max_rows = 1000`; large reads must be batched/paginated to avoid silent truncation.
- `CODE_STANDARDS.md` is the enforced DB/auth convention reference.

## Scheduler (`scheduler/`)
- Schedule source of truth: `scheduler/crontab`.
- `INTERNAL_RUNNER_SECRET` must match the `web` service secret for `/internal/*` routes.
- Local commands: `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.

## Zoom API (`zoom-api/`)
- Read `zoom-api/CLAUDE.md` before making changes; it contains stricter service-specific rules.
- Preferred commands: `make setup`, `make dev`, `make test`.
- `make setup` installs runtime deps only (`requirements.txt`); install dev deps (`pip install -r requirements-dev.txt`) before running tests in a fresh venv.
- Auth/OpenAPI requirement is enforced by tests: keep `HTTPBearer`-based auth in `zoom-api/app/auth.py` so `test_openapi_declares_security_scheme` stays green.
- Scope searches to `zoom-api/app/` and `zoom-api/tests/` to avoid `.venv/` noise.
