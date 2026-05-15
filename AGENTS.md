AGENT HANDBOOK (~150 lines)

Purpose: give coding agents a concise, practical map of this repository.
Update this file whenever commands, conventions, or workflows change.

---

1) Workspace and git hygiene
- Assume the tree may already contain user edits; do not reset/revert/delete work you did not create.
- Never amend commits or force-push unless a human explicitly asks.
- Keep diffs focused; avoid whole-file reformatting for small logic edits.
- Use ASCII by default; keep Unicode only if the file already uses it.
- Do not stage secrets (`.env.local`, Supabase service-role keys, other credentials).
- Treat `supabase/migrations/` as generated output from schema changes.

2) AI instruction files (checked)
- No Cursor rules found at `.cursor/rules/`.
- No `.cursorrules` file found.
- No Copilot rules found at `.github/copilot-instructions.md`.
- If any of these files are added later, read and honor them before editing code.

3) Project shape
- Stack: React Router v7 SSR + Vite + Tailwind CSS v4 + TypeScript strict + Supabase.
- App root: `web/app/root.tsx`.
- Route config: `web/app/routes.ts`; route modules live in `web/app/routes/`.
- Shared helpers: `web/app/lib`; Supabase helpers: `web/app/lib/supabase`.
- Path aliases: `~/` and `@/` both map to `web/app` (see `web/tsconfig.json`).
- Generated router types in `web/.react-router/types/` are read-only.

4) Where to run commands
- Run app commands from `web/` unless noted otherwise.
- Root `package.json` is not the app runtime source of truth; `web/package.json` is.
- Local default dev URL is `http://localhost:5173`.

5) Build, lint, and test commands
- Install deps: `npm install` (inside `web/`).
- Dev server: `npm run dev`.
- Type/lint gate: `npm run typecheck` (`react-router typegen && tsc`).
- There is no dedicated eslint/prettier script in `web/package.json`.
- Treat `npm run typecheck` as the required lint-quality gate.
- Production build: `npm run build`.
- Serve built app: `npm run start`.
- Full tests: `npm run test:e2e` (Playwright across `web/tests`).
- Headed tests: `npm run test:e2e:headed`.

6) Single-test command patterns (important)
- Single spec file: `npm run test:e2e -- tests/e2e/create-guardian.spec.ts`.
- Single unit-style spec file: `npm run test:e2e -- tests/unit/gift-card-csv.spec.ts`.
- Filter by title: `npm run test:e2e -- --grep "guardian sign-up creates a guardian profile"`.
- File + title filter: `npm run test:e2e -- tests/unit/gift-card-csv.spec.ts --grep "reports missing fields"`.
- Playwright auto-starts `npm run dev -- --port 5173` when `PLAYWRIGHT_BASE_URL` is unset.

7) Supabase and schema workflow
- Start local Supabase: `supabase start --debug`.
- Check local status/keys: `supabase status -o json`.
- Migration creation (required): always run `supabase migration new <name>` for any manual SQL migration.
- Never hand-create files in `supabase/migrations/` and never rename migration versions manually.
- Never edit an existing migration file once committed/shared; create a new migration for follow-up changes.
- Keep migration versions unique and strictly increasing to avoid collisions/skipped applies.
- Schema flow: edit `supabase/schemas/*.sql` -> `supabase db diff -f <name>` (or `supabase migration new <name>` for manual SQL) -> `supabase migration up`.
- If a migration failed after partial changes, do not mutate old files; add a new migration that fixes forward.
- Verify migration application with `supabase migration list` and confirm the new version appears in both local/remote when relevant.
- Regenerate DB types (local):
  `supabase gen types typescript --local > web/app/lib/database.types.ts`.
- Regenerate DB types (remote ref):
  `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.

8) Import conventions
- Prefer 3 import blocks with blank lines: external, alias (`@/` or `~/`), then relative.
- Use `import type` for type-only symbols (`verbatimModuleSyntax` is enabled).
- Prefer named exports in shared modules; keep default exports where route modules require them.
- Never edit generated files under `web/.react-router/types/` manually.

9) Formatting conventions
- Match local style in each touched file (many files use 2 spaces and no semicolons).
- Quote style is mixed; preserve existing style in the file you edit.
- Avoid mass import sorting or quote normalization unless requested.
- Keep Tailwind class strings literal and token-based.
- Avoid computed class fragments that could break Tailwind scanning.
- Add comments only when clarifying non-obvious behavior.

10) TypeScript guidelines
- `strict` mode is enabled; avoid `any`.
- Reuse Supabase types from `web/app/lib/database.types.ts`.
- Reuse route `+types` (for example `./+types/<route>`) in loaders/actions.
- Keep server/client boundaries explicit; do not import server-only modules in client paths.
- Use narrow, validated types for `formData` fields and route params.

11) Naming conventions
- React components and exported hooks: PascalCase.
- Functions, variables, helpers, selectors: camelCase.
- Shared constants: SCREAMING_SNAKE_CASE.
- Route filenames: hyphenated (for example `forgot-password.tsx`); use `index.tsx` only for index routes.

12) Router and route-module patterns
- Route modules typically export `loader`, `action`, and a default component in one file.
- After adding/removing routes, update `web/app/routes.ts`.
- Run `npm run typecheck` after route changes to refresh router-generated types.
- Keep route-specific helpers near the route unless reused broadly.

13) Data loading and mutations
- Use `useFetcher`/`fetcher.Form` for non-navigating mutations.
- Always `await request.formData()` and validate/cast inputs defensively.
- On auth-sensitive responses, preserve Supabase session headers on `redirect()`/JSON responses.
- Keep privileged operations server-side only.

14) Auth and security rules
- `VITE_SUPABASE_*` values are client-safe; keep `SUPABASE_SECRET_KEY` server-only.
- Never expose service-role credentials in browser code or serialized loader data.
- Merge metadata updates (`{ ...existing, ...updates }`) to avoid dropping keys.
- Validate and sanitize server-read params and form values.

15) Error handling expectations
- Fail early in protected loaders/actions (redirect unauthenticated users).
- Return user-friendly messages for expected failures.
- For unexpected failures, log with `console.error` and return/throw controlled responses.
- Use route error boundaries with `isRouteErrorResponse` patterns when possible.

16) UI and accessibility practices
- Reuse primitives in `web/app/components/ui/*` before creating new ones.
- Keep label/input pairing intact (`<Label htmlFor>` with matching input `id`).
- Preserve focus/hover/active states and existing spacing rhythm.
- Keep responsive behavior aligned to existing breakpoints/tokens.
- Use `cn()` from `web/app/lib/utils.ts` for conditional class composition.
- For auth sticker backdrops, use solid backgrounds only (no gradient backgrounds).

17) Testing and QA expectations
- Test files live under `web/tests/e2e` and `web/tests/unit` (both run via Playwright).
- For auth changes, manually verify login, sign-up, password reset, and protected redirects.
- Prefer targeted test commands first, then full suite only when needed.
- In handoff notes, list commands run and any manual QA performed.
- If a command cannot be run, say why and provide exact follow-up verify steps.

18) Agent editing workflow
- Prefer `Read`/`Glob`/`Grep` for code inspection over ad-hoc shell searching.
- Keep changes minimal and consistent with neighboring code.
- Avoid broad refactors unless requested or required for correctness.
- Do not introduce new dependencies without clear need.

19) Pre-handoff checklist
- Minimum for substantial code changes: run `npm run typecheck`.
- If dependencies/config/build behavior changed: run `npm run build`.
- If behavior changed: run relevant targeted tests (prefer single-file/test filters first).
- If schema changed: regenerate `web/app/lib/database.types.ts`.

20) Maintenance note
- Keep this handbook near 150 lines.
- Keep command examples current with `web/package.json` and `web/playwright.config.ts`.
- Update this file whenever workflows, conventions, or tooling change.

21) Default decision rules for agents
- If a rule is ambiguous, follow existing nearby code patterns first.
- If a change touches auth/session behavior, preserve headers and test redirects.
- If a change touches routes or schemas, run regeneration commands before handoff.
- If uncertain about style, prefer minimal edits over broad cleanup.

End of handbook.
