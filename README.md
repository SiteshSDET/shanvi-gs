# Shanvi General Store

A static storefront with a manager interface, cart, and checkout. Cross-device orders and manager access require the Supabase backend; browser storage alone does not synchronize orders.

GitHub Pages deploys the current catalog as a public, browse-only preview. Checkout and manager sign-in stay disabled until Supabase is configured. The sample catalog is not the manager's browser-local product list.

Public preview: <https://siteshsdet.github.io/shanvi-gs/>

## Before accepting real customer orders

1. Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to configure Supabase Auth, database policies, and order storage.
2. Add the Supabase project URL and anon/publishable key to `supabase-config.js`. Only public client values belong in this file.
3. Create the manager account and authorize it in `public.store_managers`.
4. Add the store's real payment details and test an order before sharing the site with customers.

Do not publish service-role keys, database passwords, or VAPID private keys. The Manager panel stays unavailable until Supabase is configured.
