alter table public.orders
  add column if not exists delivery_fee integer not null default 0
  check (delivery_fee >= 0);

alter table public.orders
  add column if not exists discount integer not null default 0
  check (discount >= 0);

alter table public.orders
  add column if not exists customer_status_token_hash text;

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
      payment_method in ('upi_id', 'upi_qr')
      or exists (
        select 1 from public.store_settings s
        where s.key = 'payment' and s.value->>'cod_enabled' = 'true'
      )
    )
  );

create table if not exists public.customer_push_subscriptions (
  endpoint text not null,
  reference text not null references public.orders (reference) on delete cascade,
  subscription jsonb not null,
  language text not null default 'en' check (language in ('en', 'hi')),
  created_at timestamptz not null default now(),
  primary key (endpoint, reference)
);

alter table public.customer_push_subscriptions
  add column if not exists language text not null default 'en'
  check (language in ('en', 'hi'));

alter table public.customer_push_subscriptions enable row level security;
revoke all on public.customer_push_subscriptions from anon, authenticated;
grant all on public.customer_push_subscriptions to service_role;

create table if not exists public.manager_push_subscriptions (
  endpoint text primary key,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.manager_push_subscriptions enable row level security;
revoke all on public.manager_push_subscriptions from anon, authenticated;
grant all on public.manager_push_subscriptions to service_role;

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_order_event()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  project_url text;
  service_role_key text;
  event_name text;
begin
  if tg_op = 'INSERT' then
    event_name := 'new';
  elsif old.status is distinct from new.status and new.status in ('Approved', 'Rejected') then
    event_name := case when new.status = 'Rejected' then 'rejected' else 'approved' end;
  else
    return new;
  end if;

  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'shanvi_supabase_url'
  limit 1;

  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'shanvi_service_role_key'
  limit 1;

  if project_url is null or service_role_key is null then
    raise warning 'Order push secrets are not configured; skipping push notification';
    return new;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/notify-order',
    body := jsonb_build_object('reference', new.reference, 'event', event_name),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notify_manager_after_order_insert on public.orders;
drop trigger if exists notify_manager_after_order_status on public.orders;
drop trigger if exists notify_manager_after_order_event on public.orders;
create trigger notify_manager_after_order_insert
  after insert on public.orders
  for each row execute function public.notify_order_event();
create trigger notify_manager_after_order_status
  after update of status on public.orders
  for each row execute function public.notify_order_event();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
