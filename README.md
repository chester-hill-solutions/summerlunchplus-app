# summerlunch+ Class Management

# Prerequisities
- Docker desktop
- NodeJS

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

# Provisioning and Deploying to Prod

Supabase GUI edits:
- need to setup supabase SMTP
- need to setup supabsae auth hooks

Otherwise develop to a branch, PR into a dev branch, PR into main, sync supabase production to main
