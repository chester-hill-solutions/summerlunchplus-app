CODE STANDARDS

SCHEMA & MIGRATIONS
- Prefer declarative schema changes: edit SQL under `supabase/schemas/` (e.g., `supabase/schemas/forms_and_classes.sql`). Treat these files as the source of truth.
- Postgres types and policies do not support `IF NOT EXISTS`; avoid it in declarative schema files.
- If you want a migration file from your declarative changes, run `supabase db diff -f <change-name>` from the repo root. This generates a migration based on the current database state.
- Apply generated migrations locally with `supabase migration up` (also from repo root) to keep your local database aligned.
- Do not hand-edit generated migration files unless correcting generation errors; fix the declarative SQL instead and regenerate.
- Commit both the updated schema SQL and any generated migrations together so reviews see intent and applied changes.
- When adding a new table or feature, also add granular `app_permissions` for its CRUD/actions (e.g., `resource.create/read/update/delete`) and map them in `role_permission`; update RLS to use the `authorize(<permission>)` helper for role-based checks and reserve `auth.uid()` for per-user ownership where required.

TYPES
- Database schema types live at `web/app/lib/database.types.ts`. Regenerate with `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts` from repo root when the schema changes.

UI
- Prefer `supabase/ui` components and existing ShadCN primitives before introducing new UI primitives.
