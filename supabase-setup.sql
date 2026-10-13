create table if not exists public.store_managers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 70),
  category text not null check (category in ('Kids', 'Gifts', 'Stationery', 'Puja', 'Gharelu Samaan', 'Electronics')),
  description text not null default '' check (char_length(description) <= 300),
  price integer not null check (price > 0),
  mrp integer not null check (mrp >= price),
  stock integer not null default 0 check (stock >= 0),
  image_url text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_name text not null check (char_length(customer_name) between 1 and 100),
  customer_phone text not null check (char_length(customer_phone) between 10 and 20),
  delivery_note text not null check (char_length(delivery_note) between 1 and 500),
  items jsonb not null,
  total integer not null check (total >= 0),
  payment_method text not null default 'upi_id' check (payment_method in ('upi_id', 'upi_qr', 'cod')),
  payer_upi_id text check (payer_upi_id is null or payer_upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$'),
  payment_confirmed boolean not null default false,
  status text not null default 'Awaiting store confirmation',
  created_at timestamptz not null default now()
);

comment on column public.orders.payment_confirmed is
  'Customer confirmed paying through external UPI/QR; not gateway-verified.';

alter table public.store_managers enable row level security;
alter table public.products enable row level security;
alter table public.store_settings enable row level security;
alter table public.orders enable row level security;

create policy "Managers can see their own authorization"
  on public.store_managers for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Anyone can view active products"
  on public.products for select to anon, authenticated
  using (active = true);
create policy "Managers can manage products"
  on public.products for all to authenticated
  using (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())));

create policy "Anyone can view store payment settings"
  on public.store_settings for select to anon, authenticated
  using (true);
create policy "Managers can manage store settings"
  on public.store_settings for all to authenticated
  using (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())));

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
create policy "Only managers can view orders"
  on public.orders for select to authenticated
  using (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())));
create policy "Only managers can update orders"
  on public.orders for update to authenticated
  using (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())));
create policy "Only managers can delete orders"
  on public.orders for delete to authenticated
  using (exists (select 1 from public.store_managers m where m.user_id = (select auth.uid())));

grant select on public.products, public.store_settings to anon, authenticated;
grant insert, update, delete on public.products, public.store_settings to authenticated;
grant select on public.store_managers to authenticated;
grant insert on public.orders to anon, authenticated;
grant select, update, delete on public.orders to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can view store images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "Managers can upload store images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and exists (select 1 from public.store_managers m where m.user_id = (select auth.uid()))
  );
create policy "Managers can update store images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and exists (select 1 from public.store_managers m where m.user_id = (select auth.uid()))
  )
  with check (
    bucket_id = 'product-images'
    and exists (select 1 from public.store_managers m where m.user_id = (select auth.uid()))
  );
create policy "Managers can delete store images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-images'
    and exists (select 1 from public.store_managers m where m.user_id = (select auth.uid()))
  );
