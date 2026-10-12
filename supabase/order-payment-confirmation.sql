alter table public.orders
  add column if not exists payment_confirmed boolean not null default false;

comment on column public.orders.payment_confirmed is
  'Customer attestation that an external UPI/QR payment was sent; not gateway-verified.';

drop policy if exists "Only managers can delete orders" on public.orders;
create policy "Only managers can delete orders"
  on public.orders for delete to authenticated
  using (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())));

grant delete on public.orders to authenticated;

drop policy if exists "Customers can place orders" on public.orders;
create policy "Customers can place orders"
  on public.orders for insert to anon, authenticated
  with check (
    char_length(customer_name) between 1 and 100
    and customer_phone ~ '^[0-9]{10}$'
    and char_length(delivery_note) between 1 and 500
    and total >= 0
    and delivery_fee in (0, 20)
    and status = 'Awaiting manager approval'
    and customer_status_token_hash ~ '^[a-f0-9]{64}$'
    and payment_method in ('upi_id', 'upi_qr', 'cod')
    and (
      (payment_method = 'upi_id' and payer_upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')
      or (payment_method in ('upi_qr', 'cod') and payer_upi_id is null)
    )
    and (
      (payment_method = 'cod' and payment_confirmed = false)
      or (payment_method in ('upi_id', 'upi_qr') and payment_confirmed = true)
    )
    and (
      payment_method in ('upi_id', 'upi_qr')
      or exists (
        select 1 from public.store_settings s
        where s.key = 'payment' and s.value->>'cod_enabled' = 'true'
      )
    )
  );
