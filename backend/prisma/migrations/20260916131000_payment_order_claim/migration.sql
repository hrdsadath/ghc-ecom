alter table public.orders
  add column provider_order_claimed_at timestamptz;

create index orders_provider_order_claim_idx
  on public.orders (payment_provider, provider_order_claimed_at)
  where razorpay_order_id is null;
