-- Run once for an existing Supabase installation before deploying the updated checkout.
alter table public.orders
  add column if not exists payment_method text not null default 'upi'
  check (payment_method in ('upi', 'upi_id', 'upi_qr', 'cod'));

alter table public.orders
  add column if not exists payer_upi_id text;

alter table public.orders
  alter column payment_method set default 'upi_id';

update public.orders
set payment_method = 'upi_id'
where payment_method = 'upi';

alter table public.orders
  drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('upi_id', 'upi_qr', 'cod'));

alter table public.orders
  drop constraint if exists orders_payer_upi_id_check;

alter table public.orders
  add constraint orders_payer_upi_id_check
  check (payer_upi_id is null or payer_upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$');

insert into public.store_settings (key, value)
values ('payment', '{"upi":"","qr":"","cod_enabled":true}'::jsonb)
on conflict (key) do update
set value = public.store_settings.value || '{"cod_enabled":true}'::jsonb
where not (public.store_settings.value ? 'cod_enabled');

drop policy if exists "Customers can place orders" on public.orders;
create policy "Customers can place orders"
  on public.orders for insert to anon, authenticated
  with check (
    char_length(customer_name) between 1 and 100
    and customer_phone ~ '^[0-9]{10}$'
    and char_length(delivery_note) between 1 and 500
    and total >= 0
    and payment_method in ('upi_id', 'upi_qr', 'cod')
    and (
      (payment_method = 'upi_id' and payer_upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$')
      or (payment_method in ('upi_qr', 'cod') and payer_upi_id is null)
    )
    and (
      payment_method in ('upi_id', 'upi_qr')
      or exists (
        select 1 from public.store_settings s
        where s.key = 'payment' and s.value->>'cod_enabled' = 'true'
      )
    )
  );
