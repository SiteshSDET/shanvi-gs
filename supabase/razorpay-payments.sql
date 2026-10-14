create table if not exists public.razorpay_payment_attempts (
  razorpay_order_id text primary key,
  reference text not null unique,
  amount integer not null check (amount > 0),
  order_payload jsonb not null,
  status text not null default 'created'
    check (status in ('created', 'verified', 'expired')),
  payment_id text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.razorpay_payment_attempts enable row level security;
revoke all on public.razorpay_payment_attempts from anon, authenticated;
grant all on public.razorpay_payment_attempts to service_role;

alter table public.orders
  drop constraint if exists orders_payer_upi_id_check;

alter table public.orders
  add column if not exists razorpay_payment_id text unique;

alter table public.orders
  add constraint orders_payer_upi_id_check
    check (
      payer_upi_id is null
      or payer_upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$'
      or payer_upi_id ~ '^[0-9]{10}$'
    );

comment on column public.orders.payment_confirmed is
  'True only when the payment gateway confirms a captured payment.';

drop policy if exists "Customers can place orders" on public.orders;
drop policy if exists "Customers can place COD orders" on public.orders;
create policy "Customers can place COD orders"
  on public.orders for insert to anon, authenticated
  with check (
    char_length(customer_name) between 1 and 100
    and customer_phone ~ '^[0-9]{10}$'
    and char_length(delivery_note) between 1 and 500
    and total >= 0
    and delivery_fee in (0, 20)
    and status = 'Awaiting manager approval'
    and customer_status_token_hash ~ '^[a-f0-9]{64}$'
    and payment_method = 'cod'
    and payer_upi_id is null
    and payment_confirmed = false
    and exists (
      select 1 from public.store_settings s
      where s.key = 'payment' and s.value->>'cod_enabled' = 'true'
    )
  );

grant insert on public.orders to anon, authenticated;
notify pgrst, 'reload schema';
