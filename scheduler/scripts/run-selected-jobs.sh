#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${SCHEDULER_ENABLED_JOBS:-}" ]]; then
  printf 'SCHEDULER_ENABLED_JOBS is required.\n' >&2
  exit 1
fi

local_cron="${SCHEDULER_LOCAL_CRON:-*/5 * * * *}"
crontab_path="/tmp/selected-crontab"
IFS=',' read -r -a jobs <<< "${SCHEDULER_ENABLED_JOBS}"
declare -A job_scripts=(
  [zoom]="zoom-jobs.sh"
  [gift-card]="gift-card-jobs.sh"
  [post-program-survey]="post-program-survey-jobs.sh"
  [export]="export-jobs.sh"
  [export-cleanup]="export-cleanup.sh"
)

for job in "${jobs[@]}"; do
  job="${job//[[:space:]]/}"
  script="${job_scripts[$job]:-}"
  if [[ -z "$script" ]]; then
    printf 'Unknown scheduler job: %s\n' "$job" >&2
    exit 1
  fi
  printf '%s /bin/bash /app/scripts/%s\n' "$local_cron" "$script" >> "$crontab_path"
done

printf '[scheduler] running selected jobs: %s\n' "$SCHEDULER_ENABLED_JOBS"
exec /usr/local/bin/supercronic "$crontab_path"
