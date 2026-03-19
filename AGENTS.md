AGENT HANDBOOK (~150 lines)

Purpose: keep this file terse but actionable so any agent can understand how to work within this repo.
Update it when you add commands, tests, or conventions that agents need to know.

---
1. Workspace & Git Hygiene
- Assume the working tree might already have user edits; do not reset, revert, or drop any files you did not author.
- Never amend commits or force push unless explicitly directed; keep history linear.
- Run commands from `web/` whenever possible; this folder contains Vite, Tailwind, and Supabase helpers.
- Prefer `Read`, `Glob`, and `Grep` instead of ad-hoc shell searches; keep file formatting intact while you edit.
- Keep changes ASCII unless the file already uses Unicode; limit comments to non-obvious logic.
- Treat `supabase/migrations/` as generated output; add schema changes to `supabase/schemas/` and seeding to `supabase/seeds/` before migrating.
- After touching schema, regenerate Supabase types: `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.
supabase gen types typescript --local > web/app/lib/database.types.ts
- Never stage `.env.local`, Supabase service keys, or other secrets; `git status` should be clean of creds.
- Cursor rules (`.cursor/`, `.cursorrules`) and Copilot instructions (`.github/copilot-instructions.md`) do not exist right now, so no extra AI-guidance applies.
- Keep diffs tight; do not reformat entire files when making small logic changes.

2. Project Shape
- Stack: React Router v7 with SSR enabled, Vite, Tailwind CSS v4, TypeScript strict, and Supabase authentication.
- Root layout and meta live in `web/app/root.tsx`; components spread under `web/app/components`, routes under `web/app/routes`, helpers in `web/app/lib`, server helpers in `web/app/server.ts` and `web/app/lib/supabase`.
- Path aliases `~/` and `@/` both point to `web/app`; generated router types in `web/.react-router/types/` are read-only.
- Tailwind tokens/global styles live in `web/app/app.css`; keep tokens literal so JIT purge does not drop them.
- Shared primitives use `cn()` for class merging and Radix `Slot`/`asChild` for composition; reuse `components/ui/*` when possible.
- Layout spacing sticks to `p-6`, `md:p-10`, `min-h-svh`, and the existing scale; avoid inventing ad-hoc spacing values.

3. Commands (run inside `web/` unless noted)
- `npm install`: install dependencies.
- `npm run dev`: start SSR dev server with HMR on port 5173.
- `npm run typecheck`: runs `react-router typegen` then `tsc`; rerun whenever routes/loaders/actions change.
- `npm run build`: produce SSR client/server bundles under `web/build`.
- `npm run start`: serve the built app via `react-router-serve ./build/server/index.js`.
- `supabase start --debug`: bring up local Supabase; use `supabase status -o json` afterward to see credentials.
- Supabase workflow: edit SQL in `supabase/schemas/`, run `supabase db diff -f <name>`, `supabase migration up`, and regenerate types with the command noted above.
- Docker (optional): from `web/`, `docker build -t summerlunchplus .` and `docker run -p 3000:3000 summerlunchplus`.
- Lint: there is no dedicated script; rely on `npm run typecheck` and TypeScript diagnostics for style enforcement.

4. Code Style Guidelines
- Imports: group by dependency type — framework/libs first, alias paths second, relative imports last. Separate each group with a blank line.
- Use `import type` for type-only imports; TypeScript enforces `verbatimModuleSyntax` so be explicit about side-effect-free imports.
- Favor named exports; route components can still be default exports only when React Router requires it.
- Formatting: match the style of the file you touch. Most files use 2-space indentation, single quotes, and optional semicolons.
- Use trailing commas wherever Prettier would insert them; avoid manual wrapping that fights the formatter implicit in the repo.
- Naming: components/hooks export names in PascalCase, helpers and selectors in camelCase, shared constants in SCREAMING_SNAKE, route files hyphenated (e.g., `forgot-password.tsx`), `index.tsx` only for index routes.
- Types: avoid `any`. Reuse generated Supabase and router types for loader data, params, and mutation payloads.
- Error handling: prefer `isRouteErrorResponse`, add user-friendly copy near controls, and log unexpected server errors with `console.error` before redirecting or returning a response.
- Imports/helpers should stay logically grouped; keep `cn`, Radix props, and validators near UI logic rather than spreading them unpredictably.
- Comments are ok when they clarify complex logic, but keep them minimal; prefer expressive naming over explanatory comments.

5. Data Fetching & Mutations
- Loaders/actions should consume generated `Route` types (`import type { Route } from "./+types/..."`) to stay in sync with React Router.
- Always `await request.formData()` and cast values safely (e.g., `const email = formData.get("email") as string`); avoid mutating the `FormData` object.
- Use `useFetcher` for mutations that do not change the current page; inspect `fetcher.state`, `fetcher.data`, and `fetcher.submission` for feedback.
- Persist Supabase session headers: attach the headers returned by Supabase to every `json()` or `redirect()` response.
- Guard protected loaders early: check the session and throw `redirect("/login")` rather than letting unauthorized data flow through.
- For mutations that must run server-side, prefer `fetcher.Form` or loader-side helpers; avoid client-side service-role usage.

6. Supabase & Auth
- `getServerClient(request)` in `web/app/server.ts` returns `{ client, headers }`; always pass `headers` along to responses to keep cookies synced.
- `createClient(request)` in `web/app/lib/supabase/server.ts` loads `VITE_` keys and should never be used client-side.
- Client code should only see publishable/anon keys (`VITE_SUPABASE_*`); service-role keys (`SUPABASE_SECRET_KEY`) belong strictly to server code.
- On signup, send metadata (`role`, `profile_id`, etc.) so triggers like `on_auth_user_created_set_role` can populate `public.user_roles`.
- When adding tables, seed `role_permission`, define granular `app_permissions`, enable RLS policies that rely on `authorize(<permission>)`, and regenerate types.
- Prefer server-side Supabase calls; client calls should only use anon keys and never leak service-role privileges.
- When updating profiles, merge metadata keys (`{ ...existing, ...updates }`) to avoid dropping values like `role` or `profile_id`.
- If you need admin functionality, use Supabase functions or server-only helpers that securely reference the service-role key.

7. Styling & UX Patterns
- Keep Tailwind class strings literal; rely on tokens defined in `web/app/app.css` instead of inventing new colors.
- Always pair `<Label htmlFor>` with `<Input id>` and manage `aria-invalid` plus focus/ring utilities to preserve accessibility.
- Use `cn()` for merging dynamic classes, especially when variants live inside `components/ui` primitives.
- Maintain hover/focus/active states from existing components; avoid removing the subtle ring/focus cues.
- Preserve font preload tags and metadata links in `root.tsx`; add new fonts only when you also add preload entries.
- Prefer responsive utilities (`sm:`, `md:`) over inline widths/heights, and stick to the spacing system already in place.
- When importing SVGs, keep them small; large assets should remain in `public/` and load via `<img src="/logo.svg" />` where feasible.

8. Testing & QA
- There is no automated test suite right now; rely on `npm run typecheck` and manual QA.
- When editing auth routes, start `npm run dev` and manually exercise login, sign-up, password reset, and protected route gating.
- Record manual testing steps in PRs, especially when you change permissions or onboarding flows.

9. Deployment & Observability
- Build the Docker image from `web/`: `docker build -t summerlunchplus .` and run with `docker run -p 3000:3000 summerlunchplus`.
- SSR is enabled; guard browser-only APIs with `typeof window !== "undefined"` to avoid hydration issues.
- Keep logging minimal in production; add targeted `console.error`/`console.warn` only when troubleshooting and remove them before merging.
- Document any new env vars you add and mention them in PR descriptions for reviewers.
- When dependencies change, rerun `npm run build` locally and note any failures or warnings.
- If you tweak Vite/Tailwind config, rerun dev server afterwards to ensure the new config is picked up.
- For monitoring, rely on remote logs when deployed; add `console.error` calls that include context before throwing.

10. Security & Secrets
- Never expose service-role keys to the browser. Only VITE-prefixed Supabase env vars should reach client bundles.
- Sanitize and validate all server-read inputs (form data, route params); keep error copy generic but helpful.
- Use `redirect()` for auth enforcement rather than letting stale client state persist on protected routes.
- Avoid PL/pgSQL variables whose names shadow system keywords (e.g., prefer `user_role_current` over `current_role`).
- Audit any new third-party dependency for runtime permissions before adding it.
- Keep `supabase/config.toml` secrets guarded; do not commit them and mirror changes manually on the remote database.
- For admin routines, wrap Supabase service-role calls in server-only helpers so you can audit the call sites.

11. File Hygiene & Routing Notes
- Never edit generated router types in `web/.react-router/types`; rerun `npm run typecheck` if routes change.
- Route files use hyphenated names (e.g., `reset-password.tsx`); `index.tsx` is for index routes only.
- After adding a route file, make sure you reference it in `web/app/routes.ts` and rerun typecheck to avoid missing route errors.
- Co-locate helpers near their consumers; move shared logic into `web/app/lib` or `web/app/components/ui` when multiple routes need it.
- Keep `.env.local` out of git; `.gitignore` already covers it, but double-check after editing env-linked files.
- Avoid adding large assets directly into component bundles; keep them in `public/` and reference via `<img src="/assets/image.png" />` when possible.

12. Local Development Tips
- Keep `npm run dev` running while editing routes so React Router typegen updates automatically; restart when adding/removing route files.
- If typegen fails, delete `web/.react-router/types` and rerun `npm run typecheck` (do not commit the deleted folder alone).
- Stop the dev server whenever you change `.env.local` to avoid cached Supabase credentials.
- Use `supabase status -o json` to copy local credentials into `.env.local` and keep them consistent with the CLI state.
- When you need to inspect the generated router types, open `web/.react-router/types/routes.tsx` but do not edit it.
- When debugging auth flows, add temporary logs server-side only; remove them before committing.
- Keep a parallel `npm run dev` session for Supabase migrations when you need to run seeds after schema changes.

13. Maintenance & Documentation
- Update this file whenever you introduce new commands, testing flows, or automation that future agents should know.
- Mention auth or env changes clearly in PR descriptions so reviewers can validate the flows.
- Describe manual QA steps in PRs for flows that are difficult to automate (e.g., Supabase-triggered onboarding flows).
- Keep the agent handbook under ~150 lines in future revisions; expand or contract content in place without duplicating points.
- Before any PR, run `npm run typecheck`, verify `npm run build` if configs/deps changed, and ensure the handbook still reflects the new behavior.

14. Routing Gotchas
- Avoid dynamic `import()` inside route modules unless lazy-loading a heavy child component; React Router handles code splitting.
- Keep loader helpers collocated with the route they serve unless they are shared across multiple routes.
- Do not export server-only helpers to the client; use `app/lib` abstractions instead.
- Always import the generated `Route` type from `./+types/...` for loader/action signatures to stay in sync with the router.
- Test new or modified routes in `npm run dev` before pushing; the dev server warns about missing route files early.

15. Suggested Next Steps
- Run `npm run typecheck` after touching routes and loaders, and mention the result in your PR description.
- If you make styling or UX changes, manually verify on both desktop and mobile viewports via the dev server.
- Keep this handbook updated with any future tooling or workflow additions so future agents can ramp quickly.

End of playbook.
