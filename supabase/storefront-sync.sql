alter table public.products
  add column if not exists size text not null default '',
  add column if not exists dimensions text not null default '',
  add column if not exists stock_tracked boolean not null default true,
  add column if not exists image_fit text not null default 'contain'
    check (image_fit in ('contain', 'cover')),
  add column if not exists image_zoom integer not null default 100
    check (image_zoom between 40 and 200),
  add column if not exists image_x integer not null default 50
    check (image_x between 0 and 100),
  add column if not exists image_y integer not null default 50
    check (image_y between 0 and 100),
  add column if not exists image_aspect_ratio integer not null default 133
    check (image_aspect_ratio between 50 and 200);

alter table public.products
  drop constraint if exists products_category_check;

update public.products
set category = 'Electrical & Electronics'
where category = 'Electronics';

alter table public.products
  add constraint products_category_check
  check (category in (
    'Kids',
    'Gifts',
    'Stationery',
    'Puja',
    'Gharelu Samaan',
    'Snacks',
    'Beauty & Personal Care',
    'Electrical & Electronics',
    'Clothing',
    'Grocery'
  ));

alter table public.products replica identity full;
alter table public.store_settings replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'store_settings'
  ) then
    alter publication supabase_realtime add table public.store_settings;
  end if;
end;
$$;
