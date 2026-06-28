#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

require_env APP_BASE_URL
require_env ZOOM_RUNNER_SECRET

RID="$(run_id)-zoom"
TARGET_URL="${APP_BASE_URL%/}/internal/zoom-jobs/run"

printf '[scheduler] starting zoom jobs run_id=%s target=%s\n' "$RID" "$TARGET_URL"
RESPONSE="$(post_json "$TARGET_URL" "x-zoom-runner-secret" "$ZOOM_RUNNER_SECRET" "$RID")"
printf '[scheduler] zoom jobs completed run_id=%s response=%s\n' "$RID" "$RESPONSE"
