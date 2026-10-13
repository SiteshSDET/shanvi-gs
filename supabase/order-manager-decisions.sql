alter table public.orders
  add column if not exists rejection_reason text
    check (rejection_reason is null or char_length(rejection_reason) between 1 and 300);

comment on column public.orders.payment_confirmed is
  'Customer confirmed paying through external UPI/QR; not gateway-verified.';
