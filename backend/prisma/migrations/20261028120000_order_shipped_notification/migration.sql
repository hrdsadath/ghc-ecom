-- Queue the shipped email (with the tracking code) when an order moves to shipped.
-- Same body as 20260723220000_orders_invoices_outbox, plus 'shipped'.
create or replace function public.enqueue_order_lifecycle_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status in ('confirmed', 'shipped', 'cancelled') then
    insert into public.outbox_events (
      aggregate_type, aggregate_id, event_type, dedupe_key, payload
    ) values (
      'order',
      new.id::text,
      'order.' || new.status::text,
      'order-' || new.status::text || ':' || new.id::text,
      jsonb_build_object(
        'orderId', new.id,
        'orderNumber', new.order_number,
        'userId', new.user_id,
        'status', new.status
      )
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;
