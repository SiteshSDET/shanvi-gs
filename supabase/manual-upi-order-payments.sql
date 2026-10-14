alter table public.orders
  drop constraint if exists orders_payer_upi_id_check;

alter table public.orders
  add constraint orders_payer_upi_id_check
    check (
      payer_upi_id is null
      or payer_upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$'
      or payer_upi_id ~ '^[0-9]{10}$'
    );

comment on column public.orders.payment_confirmed is
  'Set true by an authorized manager only after manually verifying receipt of payment.';

update public.orders
set payment_confirmed = false
where payment_method in ('upi_id', 'upi_qr')
  and status in ('Awaiting manager approval', 'Awaiting store confirmation', 'Pending');

drop policy if exists "Customers can place orders" on public.orders;
drop policy if exists "Customers can place COD orders" on public.orders;
create policy "Customers can place payment-pending orders"
  on public.orders for insert to anon, authenticated
  with check (
    char_length(customer_name) between 1 and 100
    and customer_phone ~ '^[0-9]{10}$'
    and char_length(delivery_note) between 1 and 500
    and total >= 0
    and delivery_fee in (0, 20)
    and status = 'Awaiting manager approval'
    and customer_status_token_hash ~ '^[a-f0-9]{64}$'
    and payment_confirmed = false
    and (
      (payment_method = 'cod'
        and payer_upi_id is null
        and exists (
          select 1 from public.store_settings s
          where s.key = 'payment' and s.value->>'cod_enabled' = 'true'
        ))
      or (payment_method = 'upi_id'
        and (payer_upi_id is null
          or payer_upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$'
          or payer_upi_id ~ '^[0-9]{10}$')
        and exists (
          select 1 from public.store_settings s
          where s.key = 'payment'
            and coalesce(s.value->>'upi', '') <> ''
            and coalesce(s.value->>'demo_upi', 'false') <> 'true'
        ))
      or (payment_method = 'upi_qr'
        and payer_upi_id is null
        and exists (
          select 1 from public.store_settings s
          where s.key = 'payment'
            and coalesce(s.value->>'qr', '') <> ''
            and coalesce(s.value->>'demo_qr', 'false') <> 'true'
        ))
    )
  );

notify pgrst, 'reload schema';
