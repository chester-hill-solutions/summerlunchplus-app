# Program Impact Reconciliation

Use this document with a fresh local sanitized production snapshot. It records
commands and aggregate results only. Do not add names, email addresses, raw
profile IDs, card numbers, tokens, or other personal data.

## Scope

- Snapshot date: `YYYYMMDD`
- Semester: `record semester ID or name without personal data`
- As-of time: `UTC timestamp`
- Email sanitization: email addresses rewritten to `@chsolutions.ca`
- Excluded table: `public.zoom_job_attempt`

## Commands

```bash
cd supabase/scripts/prod-data-sanitize
make all DATE=YYYYMMDD
make reset-local YES=1
make postcheck

cd ../..
supabase db query --local --file supabase/scripts/program-impact-audit.sql
```

Run the canonical application aggregate with the same semester and as-of time.
Record the command or route used without including its response data.

## Sanitization Results

| Check | Result |
|---|---:|
| Raw email-like values | |
| Sanitized email-like values | |
| Unique source emails | |
| Sanitized disallowed domains | |
| Unmapped source emails | |

## Reconciliation Results

| Metric | Audit | Canonical aggregate | Dashboard | Difference |
|---|---:|---:|---:|---:|
| Recipient families | | | | |
| Participating families | | | | |
| Household people | | | | |
| Household children | | | | |
| Sent cards | | | | |
| CAD value | | | | |
| Provisional families | | | | |

## Exceptions

| Exception | Count | Notes |
|---|---:|---|
| Missing household people answer | | |
| Missing household children answer | | |
| Family-graph fallback | | |
| Attendance threshold failure | | |
| Newest-row evidence failure | | |
| Blocked sent card | | |

## Result

- [ ] Email verification passed.
- [ ] Local postcheck passed.
- [ ] Focused tests passed.
