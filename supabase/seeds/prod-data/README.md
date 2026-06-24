# Production Snapshot Seed Folder

Use this folder for local, uncommitted production data snapshots.

## Important

- SQL dumps in this folder are gitignored via `.gitignore`.
- Do not commit production snapshot data.

## Recommended dump scope

- Keep snapshot SQL **data-only**.
- Avoid schema/DDL in dumps. Schema should continue to come from `supabase/migrations/*`.

## Keep only runtime data here

When preparing a prod dump for this folder, remove data that is already maintained by:

- migrations (`supabase/migrations/*`), and
- app bootstrap seeds (`supabase/seeds/app-data/*`).

In practice, remove rows for static/bootstrap tables such as:

- `role_permission`
- `form`
- `form_question`
- `form_question_map`
- `semester_form_requirement`
- `federal_electoral_district`
- storage bootstrap rows/policies created by app-data

The prod snapshot should focus on operational/runtime tables (profiles, enrollments, submissions, events, messages, discrepancies, etc.).

## Selecting seed mode

Switch `db.seed.sql_paths` in `supabase/config.toml`:

- app + dummy: `./seeds/app-data/*.sql`, `./seeds/dummy-data/*.sql`
- app + prod snapshot: `./seeds/app-data/*.sql`, `./seeds/prod-data/*-sanitized.sql`

Use `*-sanitized.sql` for loadable snapshot files and keep raw dumps (for reference only) outside that suffix so they are not executed by default.
