# summerlunch+ Class Management

# Prerequisities
- Docker desktop
- NodeJS

## Onboarding, roles, and permissions
- New users start as `unassigned` and are auto-assigned the required "Onboarding Survey" form. Completing all required forms auto-promotes them to `student` by default.
- Permissions are defined via `app_permissions`/`role_permission` and included in JWT claims (`permissions`, `onboarding_complete`). Default permission `site.read` is granted to non-`unassigned` roles.
- To switch to permission-only mode (no auto-promotion), set `ONBOARDING_MODE=permission` in `web/.env.local` and set the database parameter: `alter database postgres set app.onboarding_mode = 'permission';` (restart connections for it to take effect).
- Form assignments: forms declare `auto_assign` as an array of roles. A trigger syncs assignments whenever a user’s role changes or a form’s `auto_assign` changes; completed submissions are kept even if the role no longer matches. Required forms (`is_required = true`) must be submitted before `unassigned` users get access (or before `onboarding_complete` is set in permission mode).
- Access model in the schema:
  - Tables: `form`, `form_question`, `form_assignment`, `form_submission`, `form_answer`. Required gating uses `form.is_required` plus per-user `form_assignment`/`form_submission` rows to track completion.
  - Auto-assign: `form.auto_assign` (array of `app_role`) drives `form_assignment` syncing on role changes and form updates; submissions flip assignments to `submitted`.
  - Claims: `custom_access_token_hook` injects `user_role`, `permissions` (from `role_permission`), and `onboarding_complete` (from `has_completed_required_forms`) into JWTs for app-side gating.
  - RLS: admins/managers manage forms; `supabase_auth_admin` can read for hooks; assignees can read assigned forms/questions and only submit answers for their assignments. The app should deny protected areas when `onboarding_complete` is false or the role remains `unassigned` (in auto-promotion mode).

## Local database workflow
- Edit schema under `supabase/schemas/*.sql` (source of truth). Generate a migration: `supabase db diff -f onboarding-forms`.
- Apply migrations locally: `supabase migration up`.
- Apply seeds (including onboarding form/questions/assignments): `supabase db reset` (drops and rebuilds local DB, reapplies migrations and seeds).
- Regenerate types after schema changes: `supabase gen types typescript --project-ref "$(cat supabase/.temp/project-ref)" --schema public > web/app/lib/database.types.ts`.

## Tests
- Playwright API tests: `cd web && npx playwright test web/tests/api`.
- Playwright E2E tests: `cd web && npx playwright test web/tests/e2e`.
- Required envs for tests: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and optional `ONBOARDING_MODE` (default `role`).

Open docker desktop

```bash

git switch -c <YOUR-NAME> #your name will be your remote branch
cp ./web/.env.template ./web/.env.local
supabase start --debug
# Update ./web/.env.local with the supabase variables printed out
supabase status -o json # use this if you need to print out the variables again
cd web
npm run dev

```


# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

To build and run using Docker:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
