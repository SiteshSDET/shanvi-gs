drop policy if exists "Only managers can delete orders" on public.orders;
create policy "Only managers can delete orders"
  on public.orders for delete to authenticated
  using (exists (
    select 1
    from public.store_managers m
    where m.user_id = (select auth.uid())
  ));

grant delete on public.orders to authenticated;
