CODE STANDARDS

SCHEMA & MIGRATIONS
- Prefer declarative schema changes: edit SQL under `supabase/schemas/` (e.g., `supabase/schemas/forms_and_classes.sql`). Treat these files as the source of truth.
- Postgres types and policies do not support `IF NOT EXISTS`; avoid it in declarative schema files.
- Do _not_ edit the existing files under `supabase/migrations/` manually; those are generated from `supabase/schemas/`. Make schema updates under `supabase/schemas/` and keep seed SQL inside `supabase/seeds/`.
- If you want a migration file from your declarative changes, run `supabase db diff -f <change-name>` from the repo root. This generates a migration based on the current database state.
- Apply generated migrations locally with `supabase migration up` (also from repo root) to keep your local database aligned.
- Do not hand-edit generated migration files unless correcting generation errors; fix the declarative SQL instead and regenerate.
- Commit both the updated schema SQL and any generated migrations together so reviews see intent and applied changes.
- When adding a new table or feature, also add granular `app_permissions` for its CRUD/actions (e.g., `resource.create/read/update/delete`) and map them in `role_permission`; update RLS to use the `authorize(<permission>)` helper for role-based checks and reserve `auth.uid()` for per-user ownership where required.
- Every new permission must be seeded into `role_permission` (at least admin/manager) via migration to avoid RLS rejects; keep declarative SQL and migration in the same change.
- When creating tables surfaced to users, enable RLS, write select/insert/update/delete policies up front, and verify your Supabase mutations run under those policies before shipping.
- If you add a new permission to an existing table’s policies, also seed that permission for the roles that need it (admin/manager at minimum) in the same migration so JWT claims stay in sync and RLS doesn’t deny expected access.
- In PL/pgSQL functions, avoid naming local variables `current_role` (and similar built-in settings) to prevent shadowing session settings; prefer explicit names like `user_role_current`.

- TYPES
- Database schema types live at `web/app/lib/database.types.ts`. Regenerate with `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts` from repo root when the schema changes.
- Do not duplicate database enum values in route/component constants. Use generated types/constants from `web/app/lib/database.types.ts` (for example `Database['public']['Enums'][...]` and `Constants.public.Enums...`) as the single source of truth.

- ROUTES
- Register every new route file under `web/app/routes` in `web/app/routes.ts` using `route("path", "routes/your-route.tsx")` or `index("routes/your-index.tsx")` to avoid 404s.
- Run `npm run typecheck` after updating `routes.ts` to regenerate router types and catch missing routes.

- METADATA
- When calling `supabase.auth.updateUser({ data })`, merge new and existing metadata properties; never overwrite metadata with a single-key object (e.g. preserve both `role` and `profile_id`).
- On initial signup, pass the `role` field in `signUp(options.data)` so that the `on_auth_user_created_set_role` trigger
  reads `raw_user_meta_data->>'role'` and populates `public.user_roles` accordingly.
- On initial signup, insert the user’s app role into `public.user_roles` (user_id, role, assigned_by) to ensure RLS and permission mappings apply correctly.
- Use `SUPABASE_SECRET_KEY` for service-role admin operations in server-only code (e.g. `inviteUserByEmail`).

- UI
- Prefer `supabase/ui` components and existing ShadCN primitives before introducing new UI primitives.
