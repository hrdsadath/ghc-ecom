alter table public.outbox_events
  add column processing_started_at timestamptz;

alter table public.webhook_events
  add column processing_started_at timestamptz;

create index outbox_events_processing_lease_idx
  on public.outbox_events (status, processing_started_at);

create index webhook_events_processing_lease_idx
  on public.webhook_events (status, processing_started_at);
