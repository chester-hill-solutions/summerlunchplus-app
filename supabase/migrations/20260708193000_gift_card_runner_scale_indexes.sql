begin;

create index if not exists gift_card_allocation_allocated_unsent_idx
  on public.gift_card_allocation (status, reminder_sent_at, id)
  where status = 'allocated' and reminder_sent_at is null;

commit;
