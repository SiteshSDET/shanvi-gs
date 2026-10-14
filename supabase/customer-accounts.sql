alter table public.orders
  add column if not exists customer_user_id uuid
  references auth.users (id) on delete set null;

create index if not exists orders_customer_user_created_at_idx
  on public.orders (customer_user_id, created_at desc)
  where customer_user_id is not null;

comment on column public.orders.customer_user_id is
  'Customer account that owns this order; only the server-side customer account function can read or set it.';

drop policy if exists "Customer account links are server managed" on public.orders;
create policy "Customer account links are server managed"
  on public.orders as restrictive for insert to anon, authenticated
  with check (customer_user_id is null);
