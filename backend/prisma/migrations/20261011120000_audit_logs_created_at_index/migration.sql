-- Serves the activity log keyset pagination: order by created_at desc, id desc.
create index if not exists audit_logs_created_at_id_idx
  on public.audit_logs (created_at desc, id desc);
