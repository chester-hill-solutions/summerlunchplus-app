AGENT HANDBOOK (~150 lines)

Purpose: give coding agents a concise, practical map of this repository.
Update this file whenever commands, conventions, or workflows change.

---
1. Workspace and Git Hygiene
- Assume the tree may already contain user edits; do not reset, revert, or delete work you did not create.
- Never amend commits or force-push unless a human explicitly asks for it.
- Run app commands from `web/` unless stated otherwise.
- Prefer `Read`/`Glob`/`Grep` for code inspection instead of ad-hoc shell searching.
- Keep diffs focused; avoid whole-file reformatting when changing small logic.
- Use ASCII by default; only keep Unicode if the file already uses it.
- Do not stage secrets (`.env.local`, service-role keys, Supabase secrets).
- Treat `supabase/migrations/` as generated output from schema changes.

2. AI Instruction Files
- Cursor rules were checked: no `.cursor/rules/` directory and no `.cursorrules` file currently exist.
- Copilot rules were checked: no `.github/copilot-instructions.md` currently exists.
- If these files are added later, read and honor them before editing code.

3. Project Shape
- Stack: React Router v7 (SSR), Vite, Tailwind CSS v4, TypeScript strict, Supabase auth/data.
- App root: `web/app/root.tsx`; routes: `web/app/routes`; UI/components: `web/app/components`.
- Shared helpers live in `web/app/lib`; Supabase server helpers in `web/app/lib/supabase`.
- Aliases: `~/` and `@/` both resolve to `web/app`.
- Generated router types in `web/.react-router/types/` are read-only.
- Global design tokens and styles live in `web/app/app.css`.

4. Build, Lint, and Test Commands
- Install deps: `npm install` (run in `web/`).
- Dev server: `npm run dev` (React Router dev server, default port 5173).
- Type/lint gate: `npm run typecheck` (`react-router typegen && tsc`).
- Build: `npm run build` (outputs SSR bundles to `web/build`).
- Serve build: `npm run start` (`react-router-serve ./build/server/index.js`).
- Full test suite: `npm run test:e2e` (Playwright over `web/tests`, includes unit-like specs too).
- Single test file: `npm run test:e2e -- tests/e2e/create-guardian.spec.ts`.
- Single unit-style file: `npm run test:e2e -- tests/unit/gift-card-csv.spec.ts`.
- Single test by title: `npm run test:e2e -- --grep "guardian sign-up creates a guardian profile"`.
- Single file + title filter: `npm run test:e2e -- tests/unit/gift-card-csv.spec.ts --grep "reports missing fields"`.
- Headed mode: `npm run test:e2e:headed`.
- Lint note: there is no standalone eslint/prettier script; use `npm run typecheck` as the required quality gate.

5. Supabase and Database Commands
- Start local Supabase: `supabase start --debug`.
- Inspect local credentials: `supabase status -o json`.
- Schema workflow: edit `supabase/schemas/*.sql`, then `supabase db diff -f <name>`, then `supabase migration up`.
- Regenerate types (local): `supabase gen types typescript --local > web/app/lib/database.types.ts`.
- Regenerate types (remote ref): `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.

6. Import and Module Conventions
- Group imports in three blocks with blank lines: external packages, alias imports (`@/` or `~/`), then relative imports.
- Use `import type` for type-only symbols (`verbatimModuleSyntax` is enabled).
- Prefer named exports; keep default exports where route modules expect them.
- Do not edit generated files under `web/.react-router/types`.

7. Formatting and File Editing
- Match the local style of the file you touch (many files use 2-space indentation and no semicolons).
- Quote style is mixed in this repo; preserve existing file style unless there is a strong reason to normalize.
- Keep Tailwind class strings literal and token-based; avoid computed class-name fragments that break purge.
- Avoid introducing comments unless they clarify non-obvious behavior.

8. TypeScript Guidelines
- `strict` mode is enabled; avoid `any`.
- Reuse generated Supabase types from `web/app/lib/database.types.ts`.
- Reuse React Router route types from `./+types/...` in loaders/actions.
- Keep server/client boundaries explicit; do not leak server-only types or helpers into client bundles.

9. Naming Conventions
- Components and exported React hooks: PascalCase.
- Functions, variables, helpers, selectors: camelCase.
- Shared constants: SCREAMING_SNAKE_CASE.
- Route filenames: hyphenated (for example, `forgot-password.tsx`); use `index.tsx` only for index routes.

10. Error Handling Expectations
- Fail early in protected loaders/actions (`redirect('/login')` when session is missing).
- Use friendly, actionable UI error copy for expected failures.
- For unexpected server errors, log with `console.error` and return/throw controlled responses.
- Prefer `isRouteErrorResponse` patterns in route error boundaries.

11. Data Fetching and Mutations
- For non-navigating mutations, use `useFetcher` and `fetcher.Form`.
- Always `await request.formData()` and cast/validate fields defensively.
- Preserve Supabase auth/session headers on every `json()`/`redirect()` response.
- Avoid client-side privileged operations; service-role access stays server-only.

12. Auth and Security Rules
- `VITE_SUPABASE_*` keys are client-safe; `SUPABASE_SECRET_KEY` must remain server-only.
- Never expose service-role credentials in browser code.
- Merge metadata updates (`{ ...existing, ...updates }`) to avoid accidental key loss.
- Validate/sanitize route params and form input read on the server.

13. Styling and UX Rules
- Reuse primitives in `web/app/components/ui/*` and compose classes with `cn()`.
- Keep accessibility pairings intact (`<Label htmlFor>` with matching input `id`).
- Preserve focus/hover/active states and existing spacing rhythm (`p-6`, `md:p-10`, `min-h-svh`).
- Put large static assets in `public/` rather than embedding heavy content in components.

14. Testing and QA Practices
- Tests live under `web/tests` and run through Playwright.
- `web/playwright.config.ts` starts `npm run dev -- --port 5173` if `PLAYWRIGHT_BASE_URL` is not set.
- When changing auth flows, manually verify login, sign-up, password reset, and protected-route redirects.
- Record manual QA notes in PRs for flows not yet covered by automated tests.

15. Routing and Generated Artifacts
- Update `web/app/routes.ts` when adding/removing route modules.
- After route changes, run `npm run typecheck` to regenerate type artifacts and catch route mismatches.
- Do not hand-edit generated router types.
- Keep route-specific helpers near their route unless shared by multiple modules.

16. Maintenance Checklist for Agents
- If schema changes, regenerate Supabase types before finalizing.
- If deps/config change, run `npm run build` before handoff.
- Before finishing substantial code changes, at minimum run `npm run typecheck`.
- Keep this handbook near 150 lines and update it as workflows evolve.

17. Local Development Notes
- Keep `npm run dev` running while editing routes so type generation updates continuously.
- Restart the dev server when route files are added/removed or env vars change.
- If route types get stale, rerun `npm run typecheck` to regenerate `.react-router/types` artifacts.
- Use `supabase status -o json` to confirm local URLs/keys match your `.env.local`.

18. Route and Loader Patterns
- Route modules generally export `loader`, `action`, and default component together in one file.
- Use route `+types` imports for loader/action signatures to keep params/data aligned.
- Throw or return controlled responses from server handlers instead of leaking raw errors.
- Keep route-specific helpers near their route; lift only truly shared logic into `web/app/lib`.

19. UI and Accessibility Practices
- Keep form controls labeled (`Label` + matching input `id`) and preserve keyboard focus styles.
- Reuse existing UI primitives (`button`, `card`, `input`, `label`, `table`) before adding new ones.
- Preserve responsive behavior with existing utility scales (`sm`, `md`, spacing tokens in app styles).
- Use `cn()` when conditionally composing class names instead of manual string concatenation.

20. Review and Handoff Expectations
- Mention which commands you ran (`typecheck`, targeted tests, build if relevant) in your handoff.
- If you could not run a command, state why and provide a concrete follow-up verify step.
- Note any required env vars or Supabase state needed to reproduce validation.
- Update this file when workflows change so future agents inherit accurate project guidance.

End of handbook.
