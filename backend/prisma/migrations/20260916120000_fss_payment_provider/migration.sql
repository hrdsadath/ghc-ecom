-- Adds a payment provider discriminator so orders/payments can be settled by the
-- FSS bank gateway (redirect flow) alongside Razorpay.
create type public.payment_provider as enum ('razorpay', 'fss');

alter table public.orders
  add column payment_provider public.payment_provider not null default 'razorpay',
  add column fss_track_id text unique;

alter table public.orders
  add constraint orders_payment_provider_reference_check check (
    (payment_provider = 'razorpay' and fss_track_id is null)
    or (payment_provider = 'fss' and razorpay_order_id is null)
  );

create index orders_provider_status_expiry_idx
  on public.orders (payment_provider, status, payment_expires_at);

alter table public.payments
  add column provider public.payment_provider not null default 'razorpay',
  add column fss_transaction_id text unique,
  alter column razorpay_payment_id drop not null;

alter table public.payments
  add constraint payments_provider_reference_check check (
    (provider = 'razorpay' and razorpay_payment_id is not null and fss_transaction_id is null)
    or (provider = 'fss' and fss_transaction_id is not null and razorpay_payment_id is null)
  );

-- Record the settling provider in the order lifecycle audit entry.
create or replace function public.audit_order_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then return new; end if;
  if new.status in ('confirmed', 'cancelled') then
    insert into public.audit_logs (
      actor_id, action, entity_type, entity_id, metadata
    ) values (
      null,
      case
        when new.status = 'confirmed' then 'payment.order_confirmed'
        else 'order.cancelled'
      end,
      'order',
      new.id::text,
      jsonb_build_object(
        'from', old.status,
        'to', new.status,
        'paymentProvider', new.payment_provider,
        'razorpayOrderId', new.razorpay_order_id,
        'fssTrackId', new.fss_track_id
      )
    );
  end if;
  return new;
end;
$$;
