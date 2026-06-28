insert into public.ip_org_policy (org_pattern, match_mode, policy_class, enabled, note, priority)
values
  ('cloudflare', 'contains', 'infra_proxy', true, 'Cloudflare proxy/edge infrastructure', 10),
  ('datacamp', 'contains', 'vpn_hosting_datacenter', true, 'Greylist for manual review', 20)
on conflict (org_pattern, match_mode)
do update set
  policy_class = excluded.policy_class,
  enabled = excluded.enabled,
  note = excluded.note,
  priority = excluded.priority,
  updated_at = now();
