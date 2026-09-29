-- HDFC SmartGateway becomes the only payment gateway: Razorpay and the unused
-- FSS scaffold are removed, so the provider discriminator goes away too.

-- 1. Keep Razorpay identifiers of historical orders/payments/refunds for support
--    and accounting before their columns are dropped. No application code reads it.
create table public.legacy_razorpay_references (
  entity_type text not null check (entity_type in ('order', 'payment', 'refund')),
  entity_id uuid not null,
  razorpay_id text not null,
  archived_at timestamptz not null default now(),
  primary key (entity_type, entity_id)
);
alter table public.legacy_razorpay_references enable row level security;
revoke all on public.legacy_razorpay_references from anon, authenticated;
grant select, insert, update, delete on public.legacy_razorpay_references to service_role;

insert into public.legacy_razorpay_references (entity_type, entity_id, razorpay_id)
select 'order', id, razorpay_order_id from public.orders where razorpay_order_id is not null
union all
select 'payment', id, razorpay_payment_id from public.payments where razorpay_payment_id is not null
union all
select 'refund', id, razorpay_refund_id from public.refunds where razorpay_refund_id is not null;

-- 2. Razorpay checkouts still awaiting payment can never complete now; fail them
--    so their stock reservations are released.
select public.fail_pending_order(id)
from public.orders
where status = 'payment_pending' and payment_provider = 'razorpay';

-- 3. Orders: drop Razorpay/provider columns (their indexes and checks go with them).
alter table public.orders drop constraint orders_payment_provider_reference_check;
alter table public.orders
  drop column razorpay_order_id,
  drop column provider_order_claimed_at,
  drop column payment_provider;
alter table public.orders rename column fss_track_id to hdfc_order_id;
alter table public.orders
  rename constraint orders_fss_track_id_key to orders_hdfc_order_id_key;

-- 4. Payments.
alter table public.payments drop constraint payments_provider_reference_check;
alter table public.payments
  drop column razorpay_payment_id,
  drop column provider;
alter table public.payments rename column fss_transaction_id to hdfc_transaction_id;
alter table public.payments
  rename constraint payments_fss_transaction_id_key to payments_hdfc_transaction_id_key;

drop type public.payment_provider;

-- 5. Refunds: SmartGateway refunds are identified by our unique_request_id.
alter table public.refunds drop column razorpay_refund_id;
alter table public.refunds add column hdfc_refund_id text unique;

-- 6. Audit triggers referenced the dropped columns.
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
        'hdfcOrderId', new.hdfc_order_id
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_refund_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = old.status then return new; end if;
  insert into public.audit_logs (
    actor_id, action, entity_type, entity_id, metadata
  ) values (
    null,
    'refund.status_changed',
    'refund',
    new.id::text,
    jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'hdfcRefundId', new.hdfc_refund_id,
      'amountPaise', new.amount_paise
    )
  );
  return new;
end;
$$;
