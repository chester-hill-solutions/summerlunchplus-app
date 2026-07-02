#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

require_env APP_BASE_URL
require_env INTERNAL_RUNNER_SECRET

RID="$(run_id)-gift-cards"
TARGET_URL="${APP_BASE_URL%/}/internal/gift-card-jobs/run"

printf '[scheduler] starting gift card jobs run_id=%s target=%s\n' "$RID" "$TARGET_URL"
RESPONSE="$(post_json "$TARGET_URL" "x-internal-runner-secret" "$INTERNAL_RUNNER_SECRET" "$RID")"
printf '[scheduler] gift card jobs completed run_id=%s response=%s\n' "$RID" "$RESPONSE"
