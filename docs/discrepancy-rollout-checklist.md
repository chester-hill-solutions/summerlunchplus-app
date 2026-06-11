# Discrepancy Rollout Checklist

Use this checklist before merging discrepancy changes into production.

## Scope
- #215 set better priority on discrepancies
- #140 alert when different families share exact address
- #233 plan discrepancy for IP location vs profile location
- #236 person hover shows discrepancy information
- #20 alert difference in address and request location and improve hover/discrepancy copy

## Deployment Order
1. Apply Supabase migration(s) first.
2. Verify migration success in staging.
3. Deploy web app changes after database constraints support new signal types and columns.

## Staging Migration Timing Gate
1. Record start and end time for `supabase migration up` against staging.
2. Confirm no prolonged lock symptoms on `public.profile` and `public.suspicious_signal` reads/writes.
3. If migration runtime or lock impact is outside acceptable SLO, pause release and split migration.

## Env and Provider Gate
- `GEOIP_PROVIDER` defaults to `none` for safe rollout.
- If enabling provider in production, set exactly one provider:
  - `GEOIP_PROVIDER=ipapi` or
  - `GEOIP_PROVIDER=ipinfo` with `IPINFO_TOKEN`
- Confirm legal/privacy approval for outbound IP geolocation requests.

## Functional Acceptance Criteria
- Highest-priority open signal is deterministic via `priority_score` ordering.
- Cross-family exact-address signal appears when same normalized address is shared outside family graph.
- IP/profile location signal appears when request-location evidence conflicts with profile location.
- Workshop enrollment profile hover shows:
  - top discrepancy summary
  - clear indicator when additional open signals exist
- Global discrepancies table and person discrepancies page copy clearly indicate severity and priority context.

## Post-Deploy Monitoring
- Check error logs for:
  - `[suspicious-signal] insert failed`
  - `[geoip]` lookup/cache failures
  - `[suspicious-signal] cross-family fanout refresh failed`
- Validate discrepancy counts are plausible and not spiking unexpectedly.
