# AGENTS.md

## Scope
- Main product is `web/` (React Router v7 SSR). Run Node commands from `web/`.
- `scheduler/` and `zoom-api/` are separate deployables with their own tooling.
- Before editing `zoom-api/`, read `zoom-api/CLAUDE.md` and follow its stricter workflow.

## Git/Worktree Workflow
- Never work directly on `main`; always use a feature branch.
- Create all git worktrees under `/Users/saihaansyed/chs/prj/summerlunchplus-app/worktrees/`.
- Use branch names in the form `sai/<topic>` for this repo.

## Commands That Actually Work
- Root `package.json` has no scripts; use service-local commands.
- Web setup/run (`web/`): `npm ci`, `npm run dev`, `npm run typecheck`, `npm run build && npm run start`, `npm run test`.
- There is no lint script in `web/package.json`; do not invent `npm run lint`.
- First local boot (repo root): `cp web/.env.template web/.env.local` -> `supabase start --debug` -> copy values from `supabase status -o json` into `web/.env.local`.

## Web Routing/Auth Gotchas
- Routes are manually registered in `web/app/routes.ts` (not file-system auto routes); missing registration means 404.
- After changing `web/app/routes.ts`, run `npm run typecheck` to regenerate React Router types.
- Public/auth allowlist and onboarding redirects live in `web/app/root.tsx`; add new public paths there.
- Keep onboarding behavior aligned across `web/app/root.tsx`, `web/app/lib/auth.server.ts`, and `web/app/routes/auth/sign-up-details.tsx`.
- Signup details route is `/auth/sign-up-details`.
- `createClient` in `web/app/lib/supabase/server.ts` returns `{ supabase, headers }`; pass `headers` in redirects/responses or auth cookies are dropped.
- Staff manage access is exact-path gated by `STAFF_ALLOWED_MANAGE_PATHS` in `web/app/routes/manage/team.tsx`; add both page routes and any backing action/data endpoints explicitly.
- `ONBOARDING_MODE` defaults to `role`; only `permission` enables permission-based gating.

## Tests and CI
- Playwright is used for both e2e and unit suites under `web/tests`; `npm run test` runs all.
- Focused runs (`web/`): `npm run test:e2e -- tests/e2e/<spec>.spec.ts` and `npm run test:unit -- tests/unit/<spec>.spec.ts`.
- If `PLAYWRIGHT_BASE_URL` is unset, Playwright auto-starts `npm run dev -- --port 5173`.
- Admin e2e helpers require `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (env or `web/.env.local`); tests are skipped/fail without them.
- CI (`.github/workflows/tests.yml`) installs deps, starts Supabase, generates `web/.env.local`, then runs only `npm run test` (no separate typecheck step).

## Supabase Workflow
- Follow `CODE_STANDARDS.md` for DB changes.
- Schema source of truth is `supabase/schemas/*.sql`; avoid hand-editing generated files in `supabase/migrations/`.
- Standard flow (repo root): edit schema SQL -> `supabase db diff -f <name>` -> `supabase migration up`.
- Regenerate DB types after schema changes:
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`
- Keep permission seeds/RLS changes in the same change as schema updates (`app_permissions`, `role_permission`, policies).
- Auth source of truth is `public.user_roles` + JWT claims; `auth.users.raw_user_meta_data.role` can drift.
- Local seed mode is configured in `supabase/config.toml` to use sanitized prod snapshot + app seed SQL.
- Supabase API row cap is `1000` (`supabase/config.toml`); batch large reads.

## Scheduler Notes
- Cron schedule source of truth is `scheduler/crontab`.
- `INTERNAL_RUNNER_SECRET` must match across `scheduler` and `web` for `/internal/*` routes.
- Scheduler commands (`scheduler/Makefile`): `make cron`, `make cron-bg`, `make logs`, `make down`, `make smoke-all`.
- `make smoke-all` covers zoom/export/cleanup only; run gift-card smoke separately via `scheduler/scripts/gift-card-jobs.sh`.
