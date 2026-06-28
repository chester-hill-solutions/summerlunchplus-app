#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/common.sh"

require_env APP_BASE_URL
require_env EXPORT_RUNNER_SECRET

RID="$(run_id)-export"
TARGET_URL="${APP_BASE_URL%/}/internal/export-jobs/run"

printf '[scheduler] starting export jobs run_id=%s target=%s\n' "$RID" "$TARGET_URL"
RESPONSE="$(post_json "$TARGET_URL" "x-export-runner-secret" "$EXPORT_RUNNER_SECRET" "$RID")"
printf '[scheduler] export jobs completed run_id=%s response=%s\n' "$RID" "$RESPONSE"
