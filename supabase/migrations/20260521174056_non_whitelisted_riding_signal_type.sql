alter table public.suspicious_signal
  drop constraint if exists suspicious_signal_signal_type_chk;

alter table public.suspicious_signal
  add constraint suspicious_signal_signal_type_chk
  check (
    signal_type in (
      'address_mismatch',
      'network_distance_anomaly',
      'non_whitelisted_riding'
    )
  );
