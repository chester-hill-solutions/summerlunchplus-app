# Scheduler Service

This service runs cron schedules and triggers internal job routes on the `web` service.

## Deploy

- Railway service name: `scheduler`
- Service root: `scheduler/`
- Uses `scheduler/railway.toml`

## Required environment variables

- `APP_BASE_URL` - base URL of the web service, for example `https://summerlunchplus.up.railway.app`
- `ZOOM_RUNNER_SECRET` - must match `web` service secret for `/internal/zoom-jobs/run`
- `EXPORT_RUNNER_SECRET` - must match `web` service secret for export internal routes

## Schedule source of truth

Schedules are declared in `scheduler/crontab`.

Current jobs:

- `*/15 * * * *` -> `/internal/zoom-jobs/run`
- `*/10 * * * *` -> `/internal/export-jobs/run`
- `5 * * * *` -> `/internal/export-jobs/cleanup`
