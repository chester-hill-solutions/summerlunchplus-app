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

  local secret_header_name_lc
  secret_header_name_lc="$(printf '%s' "$secret_header_name" | tr '[:upper:]' '[:lower:]')"

  local -a header_args
  header_args=(
    -H "x-internal-runner-secret: ${secret_value}"
    -H "x-cron-run-id: ${run_id_value}"
  )

  if [[ -n "$secret_header_name" && "$secret_header_name_lc" != "x-internal-runner-secret" ]]; then
    header_args+=( -H "${secret_header_name}: ${secret_value}" )
  fi

  curl --fail --silent --show-error \
    --max-time 60 \
    --retry 2 \
    --retry-delay 3 \
    -X POST "$url" \
    "${header_args[@]}"
}
