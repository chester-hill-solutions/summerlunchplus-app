AGENT HANDBOOK (~150 lines)

Sections are terse and action-oriented so another agent can ramp quickly. Match surrounding style; keep edits incremental.

Workspace and Git Hygiene
- Assume the working tree may be dirty; never reset or drop user changes. Do not amend commits unless asked. Avoid force pushes.
- Run commands from `web/` unless noted; `package-lock.json` means use `npm`.
- Keep edits ASCII unless the file already uses Unicode. Add comments only for non-obvious logic.
- Favor repo tools (Read/Glob/Grep) over ad-hoc shell exploration. Preserve existing formatting; avoid mass rewraps.

Project Shape
- Stack: React Router v7 (SSR on), TypeScript strict, Vite, Tailwind CSS v4 (new @import syntax), Supabase for auth.
- App lives in `web/`. Routes in `web/app/routes`; shared UI in `web/app/components`; utilities in `web/app/lib`; server helper in `web/app/server.ts`.
- Path aliases `~/` and `@/` point to `web/app`. Generated router types live in `web/.react-router/types` (never edit).
- No Cursor rules (`.cursor/`, `.cursorrules`) or Copilot instructions (`.github/copilot-instructions.md`) exist as of this revision.

Repo Map (quick look)
- Entry layout and meta: `web/app/root.tsx`; layout wrapper `Layout` defined there.
- Auth pages: `routes/login.tsx`, `routes/sign-up.tsx`; protected sample `routes/protected.tsx`.
- Welcome assets: `web/app/welcome/*`; keep branding intact.
- Tailwind tokens and global styles: `web/app/app.css`.

Environment and Secrets
- Copy `web/.env.template` to `web/.env.local` before running anything.
- Required envs: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_*`. Frontend uses VITE vars; `app/server.ts` uses non-VITE vars.
- Local Supabase: from repo root run `supabase start --debug`, then `supabase status -o json` to reprint creds.
- Never commit `.env.local` or real keys; `.gitignore` already excludes them.

Commands (run inside `web/`)
- Install deps: `npm install`.
- Dev server (SSR + HMR): `npm run dev` (port 5173 default).
- Type generation + typecheck: `npm run typecheck` (runs `react-router typegen` then `tsc --noEmit`).
- Build: `npm run build` (outputs to `web/build/client` and `web/build/server`).
- Serve built app: `npm run start` (uses `react-router-serve ./build/server/index.js`).
- Lint: none configured; rely on TypeScript errors and file-local patterns.
- Tests: none configured (no Jest/Vitest). Single-test execution not available; if you add a runner, document `npm test -- --runInBand path/to/file.test.ts`.

Routing and Data
- File-based routes under `app/routes`; use hyphenated names and `.tsx` suffix (`forgot-password.tsx`). Index routes use `index.tsx`.
- Loader/action types come from generated `Route` types (`import type { Route } from "./+types/..."`); prefer these over manual typing.
- Redirects: throw `redirect()` from `react-router`; include Supabase headers when present.
- Mutations that keep the page mounted should use `useFetcher` / `fetcher.Form` (see login/sign-up patterns).
- Gate protected pages in loaders by checking Supabase session and redirecting unauthenticated users.

Supabase Usage
- SSR helper: `getServerClient(request)` in `app/server.ts` returns `{ client, headers }` using `SUPABASE_URL/ANON_KEY` and cookie helpers.
- Route helper: `createClient(request)` in `app/lib/supabase/server.ts` returns `{ supabase, headers }` using `VITE_SUPABASE_*`; attach returned headers to responses to persist cookies.
- Favor server-side Supabase; only publishable keys belong on the client. Avoid client-side service-role access entirely.

Styling and UI
- Tailwind v4; theme tokens live in `app/app.css`. Dark mode via `.dark`. Keep tokens literal to avoid purge misses.
- Use `cn()` from `app/lib/utils.ts` for class merges; `class-variance-authority` drives variants (e.g., `components/ui/button.tsx`).
- Shared primitives follow ShadCN-like patterns: Button, Card, Input, Label. Prefer composition (`asChild`, Radix `Slot`) over new primitives.
- Preserve data attributes (`data-slot`, `data-variant`, `data-size`) and accessibility props (`htmlFor`, `aria-invalid`).
- Fonts: Inter links exported from `root.tsx`; keep link tags intact.

Formatting and Imports
- TypeScript strict with `verbatimModuleSyntax`; mark type-only imports with `import type`.
- Mixed semicolons; mirror the file you touch (recent files lean semicolon-free, single quotes).
- Use 2-space indent and trailing commas where Prettier would. Avoid manual hard wraps that fight formatting.
- Import order: framework/libs first, then app aliases, then relatives. Keep type imports grouped with `type` keyword. Prefer named exports; use default export only for route components when required.

Types and Naming
- Components: PascalCase; hooks/utilities: camelCase; constants: SCREAMING_SNAKE if shared or lowerCamel when local.
- Route handlers are named exports (`loader`, `action`, `meta`, `links`, etc.).
- Files: hyphenated route names, camelCase helpers, `index.tsx` only for index routes.
- Avoid `any`; use generated Supabase and router types for params and responses.

Error Handling and Logging
- Use `isRouteErrorResponse` and `ErrorBoundary` pattern in `root.tsx`; show stack only in `DEV`.
- Auth flows return `{ error: string }`; render inline near the relevant input.
- On unexpected errors, `console.error` server-side, then redirect or surface a concise message.
- When redirecting after Supabase mutations, include returned headers to persist session cookies.

Data Fetching and Mutations
- Parse form data with `await request.formData()`; cast safely (`as string`). Avoid mutating in loaders unless required for auth context.
- Use `useFetcher` state (`submitting`) for loading indicators; keep non-navigation mutations in `fetcher.Form`.

Client Rendering and Layout
- Root layout + meta live in `root.tsx`; preserve `ScrollRestoration`, `Scripts`, `Meta`, `Links` exports.
- Default spacing uses Tailwind utilities (`p-6 md:p-10`, `min-h-svh`). Match existing scale and rhythm.
- Avoid browser-only APIs during SSR unless guarded with `typeof window !== 'undefined'`.

Accessibility and UX
- Always pair `Label htmlFor` with `Input id`; keep focus styles and ring classes.
- Maintain button/link hover and focus-visible behaviors; keep `aria-invalid` on error states.
- Error copy should be short, user-friendly, and near the control.

Performance
- Let React Router handle code splitting; lazy-load heavy modules at route level.
- Keep classes literal to satisfy Tailwind purge. Minimize client-side Supabase calls; rely on loaders for auth gating.

File Hygiene
- Never edit generated `web/.react-router/types/*`; rerun `npm run typecheck` after route changes.
- Keep `.env.local` out of git. Assets under `public/` are served statically; avoid importing large assets directly.
- Match existing semicolon/quote style; do not reformat entire files while touching small sections.

When Adding or Refactoring Code
- Co-locate helpers near consumers unless shared; then use `app/lib` or `app/components/ui`.
- Prefer functional components; avoid class components. Keep comments minimal and purposeful.
- For new commands or scripts, update this file with how to run single items (tests, generators).

Testing and QA
- Currently rely on `npm run typecheck` and manual QA via dev server. If you add a test runner, document single-test syntax.
- Manual flows to click through when touched: auth login, sign-up, password reset/redirects, protected route gating.

Deployment Notes
- Dockerfile lives in `web/`; build with `docker build -t my-app .` (from `web/`), run with `docker run -p 3000:3000 my-app`.
- SSR is enabled (`react-router.config.ts` sets `ssr: true`); guard browser-only APIs.

Security
- Never expose service-role keys to the browser. Only publishable/anon keys go in VITE_ vars.
- Sanitize and validate form input server-side; keep error messages generic.
- Prefer `redirect` for auth enforcement instead of client navigation.

Observability
- Logging is minimal; add targeted `console.error` while debugging, but remove noisy logs before commit.

Local Dev Tips
- Keep `npm run dev` running to catch router-type regeneration needs; restart when route files are added/removed.
- If typegen fails, delete `web/.react-router/types` and rerun `npm run typecheck` (do not commit deletions alone).
- Cache resets: stop dev server when changing env files to avoid stale Supabase credentials.

Routing Gotchas
- Avoid dynamic `import()` inside route modules unless lazy-loading a heavy child component; React Router handles code splitting.
- Put loader-only helpers in the same file or `app/lib` to keep bundle clean; do not export server-only helpers to the client.
- When adding routes, maintain hyphenated file names and keep index routes explicit with `index.tsx`.

UI and Assets
- Stick to existing type scale and spacing; prefer adjusting Tailwind tokens over per-component magic numbers.
- Keep SVG/logo assets under `web/app/welcome` or `public/`; import as components only if small.
- Avoid new global fonts without updating preload/link tags in `root.tsx`.

Git and Secrets
- Never stage `.env.local` or Supabase credentials. Double-check `git status` before commits.
- Do not reformat unrelated files; keep diffs tight to touched logic.
- Respect user changes already in the working tree—do not revert or overwrite without instruction.

Docs and PRs
- Update this file when adding commands or conventions agents should know.
- In PR descriptions, call out auth flow changes and any new env vars.
- If you add a test runner, include single-test invocation and example filenames.

Agent Checklist Before PRs
- `cd web && npm run typecheck`.
- If routes/auth touched, run the dev server and click through auth flows to confirm cookies persist.
- After dependency or config changes, ensure `npm run build` succeeds.

Contact Points
- No automated commit hooks here; keep changes small and document PR intent.

End of playbook.
