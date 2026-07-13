# Scheduler Service

This service runs cron schedules and triggers internal job routes on the `web` service.

## Deploy

- Railway service name: `scheduler`
- Service root: `scheduler/`
- Uses `scheduler/railway.toml`

## Required environment variables

- `APP_BASE_URL` - base URL of the web service, for example `https://summerlunchplus.up.railway.app`
- `INTERNAL_RUNNER_SECRET` - must match `web` service `INTERNAL_RUNNER_SECRET`

## Local run

From `scheduler/`:

1. Copy `.env.template` to `.env.local` and set values.
2. Run cron in foreground:

   ```bash
   make cron
   ```

Useful local commands:

- `make cron-bg` - run scheduler container in background
- `make logs` - follow background cron logs
- `make down` - stop background container
- `make smoke-all` - run all four jobs once immediately

## Troubleshooting

- Verify env parity first:
  - `scheduler` has `APP_BASE_URL` and `INTERNAL_RUNNER_SECRET`
  - `web` has matching `INTERNAL_RUNNER_SECRET`
- Validate internal routes manually:
  - `POST /internal/zoom-jobs/run`
  - `POST /internal/export-jobs/run`
  - `POST /internal/export-jobs/cleanup`
- If jobs return `401 Unauthorized`, secrets do not match.
- If jobs return `5xx`, inspect `web` logs by `runId` (`x-cron-run-id`) and check Zoom API reachability.
- For Zoom attendance sync delays, a `pending` sync status indicates retryable report lag; the next cron pass will retry.

## Schedule source of truth

Schedules are declared in `scheduler/crontab`.

Current jobs:

- `*/5 * * * *` -> `/internal/zoom-jobs/run`
- `*/5 * * * *` -> `/internal/gift-card-jobs/run`
- `*/5 * * * *` -> `/internal/export-jobs/run`
- `5 * * * *` -> `/internal/export-jobs/cleanup`
