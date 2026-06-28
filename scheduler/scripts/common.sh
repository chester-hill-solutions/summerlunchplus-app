#!/usr/bin/env bash

set -euo pipefail

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    printf '[scheduler] missing required env: %s\n' "$key" >&2
    exit 1
  fi
}

run_id() {
  date -u +"sch-%Y%m%dT%H%M%SZ"
}

post_json() {
  local url="$1"
  local secret_header_name="$2"
  local secret_value="$3"
  local run_id_value="$4"

  curl --fail --silent --show-error \
    --max-time 60 \
    --retry 2 \
    --retry-delay 3 \
    -X POST "$url" \
    -H "${secret_header_name}: ${secret_value}" \
    -H "x-cron-run-id: ${run_id_value}" \
    -H "x-internal-runner-secret: ${secret_value}"
}
