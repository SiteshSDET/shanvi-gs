# Store manager and local preview

Without Supabase configured, manager sign-in and shared order management are disabled. A browser-only password is not safe on a public website because visitors can inspect the JavaScript and bypass it. When Supabase is configured, manager sign-in uses Supabase Auth and only users listed in `public.store_managers` can access manager tools and orders. Logo, product, offer, and delivery settings remain browser-local.

## Security limitation

Static credentials in a browser application are not secret: a visitor who inspects or downloads the page can find and bypass the check. The app therefore disables manager sign-in until Supabase is configured. Do not publish this build as an active store until the backend and real payment details have been configured.

## Managing the catalog

Open **Manager**, enter the manager credentials, then add products with their category (including Electronics), name, selling price, MRP, stock, optional size and dimensions, description, and photo. Portrait and landscape photos with any aspect ratio are accepted up to 2 MB and resized locally. After selecting a photo, use the visible **×** in the preview's top-right corner to remove it. Choose Fill frame or Show full image, then adjust zoom and horizontal/vertical position; the 4:3 preview matches the customer product card and saves those display settings with the item. The manager's product list is grouped by section and has a section filter, plus Edit and Remove controls.

Use **Festival banner** to set the small heading, main headline, customer message, and background photo. The live preview shows the banner's center-crop; a wide landscape **16:6** image, ideally **1600 × 600 px**, gives the best fit. The customer-page photo uses a gentle animated zoom/pan with animated festival sparkles, with a dark overlay for readable text. Product and banner photos are resized locally to reduce browser storage use. In the product editor, use **Remove product photo** to clear the current/selected photo; an item without a photo uses its category placeholder. Banner, product details, and settings are saved in this browser only; they do not sync to other devices.

In **Payment details**, set a store UPI ID, choose a QR image, and toggle COD. The included UPI ID and QR are sample data for demonstration only; do not send money to them. Replace them with the store's real payment details before using payment options.

An order appears in **Customer orders** only after the customer confirms payment and the order is successfully saved. The manager list refreshes immediately on supported Supabase Realtime/local-tab events and checks again every 15 seconds while the Manager panel is open. With Supabase configured, customers submit orders as **Awaiting manager approval**; only authenticated, authorized managers can view and approve them. UPI transfer is not automatically verified. Confirm payment and order details manually.

The Manager order list is at the bottom of the manager tools. Its **Pending**, **Completed**, **Rejected**, and **All** filters separate orders by status. Each order shows **Accept → Delivered → Complete** in that order; only the next valid action is enabled. **Reject** is available while an order is pending or accepted. Status changes are saved in Supabase when connected, or in this browser in local/demo mode.

## Storefront options

- **Logo:** in Manager, upload a square image and save it. It is resized and stored in this browser.
- **Free-item offer:** choose an integer minimum basket amount and a product to give free. The threshold is checked against the item subtotal after the existing coupon discount and before delivery. One free unit is added to eligible baskets; it counts against available stock.
- **Inventory:** tracked products show remaining units to customers, cannot be added beyond stock, and are decremented after a successful order on that browser. Product and inventory storage is still browser-local.
- **Delivery:** enter the store latitude and longitude in Manager, or use the manager device's location button while at the store. Customer checkout requests browser location. A straight-line distance over 2 km costs ₹20; within 2 km costs ₹0. If the store pin or customer location is unavailable/denied, checkout uses the agreed ₹20 fallback. Location permission requires HTTPS (localhost is also treated as secure by browsers).
- The top announcement strip has been removed; the English/Hindi button is beside the cart.

## Free-tier orders, approvals, and push notification setup

Push alerts need an online Supabase project and an HTTPS deployment; they cannot be delivered by browser-local storage alone. Only orders successfully inserted into Supabase can trigger push. Supabase and the Web Push protocol have free/open-source options, but free tiers and mobile browser policies can change. iPhone web push generally requires the manager site to be installed to the Home Screen and notification permission granted.

HTML, CSS, and browser JavaScript can run the storefront and save demo orders on one browser, but cannot securely synchronize customer orders between different phones or deliver push notifications while the manager page is closed. That requires an online backend. The app already includes a Supabase integration that can use its free tier; project creation, keys, and deployment still require the store owner to configure them.

For a **same-browser, same-device test without Supabase**, sign in to Manager, open **Order notifications**, and tap **Enable browser alerts**, then allow the browser prompt. Open the storefront in another tab in that same browser and place a local/demo order. Keep the manager page open; the browser storage event will show the order, play a short beep, and show a system alert if notifications are supported. Use **Test sound and notification** first to confirm permission and sound. This local method cannot alert another device and does not work when the manager page is closed.

### Cross-device manager push setup

This is needed for orders from customers on other devices and for push alerts while the manager tab is closed. The project is **not connected to Supabase yet**: `supabase-config.js` currently has blank values. Follow these steps in order:

1. Create a Supabase project at `https://supabase.com/` and keep its project URL, project reference ID, anon/publishable key, and service-role key available. In the SQL editor, run the root-level files `supabase-setup.sql` and `supabase-order-payment-update.sql`.
2. Create the manager account in Dashboard → Authentication → Users. Use its email/password to sign in to Manager after setup. Copy the user's UUID and authorize it by running:

   ```sql
   insert into public.store_managers (user_id)
   values ('MANAGER_AUTH_USER_UUID')
   on conflict (user_id) do nothing;
   ```

3. Generate Web Push keys (free) on a computer with Node.js:

   ```sh
   npx web-push generate-vapid-keys
   ```

   Save both generated keys privately. The public key goes in `supabase-config.js`; never put the VAPID private key or Supabase service-role key in frontend code.
4. Install/use the free Supabase CLI, sign in, and link this project from a terminal opened in the project folder:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase functions deploy register-manager-push --no-verify-jwt
   npx supabase functions deploy register-customer-push --no-verify-jwt
   npx supabase functions deploy notify-order
   ```
5. Add the server-only push secrets (replace the example values):

   ```sh
   npx supabase secrets set \
     MANAGER_ENROLLMENT_CODE="choose-a-long-random-code" \
     VAPID_PUBLIC_KEY="your-vapid-public-key" \
     VAPID_PRIVATE_KEY="your-vapid-private-key" \
     VAPID_SUBJECT="mailto:you@example.com"
   ```

6. In the Supabase SQL editor, save the project URL and **service-role key** in Supabase Vault for the database trigger. Replace placeholders; never paste these secrets into `index.html` or `supabase-config.js`:

   ```sql
   select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'shanvi_supabase_url');
   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'shanvi_service_role_key');
   ```

7. Run `supabase/features.sql` in the Supabase SQL editor. It adds order fields and push tables, enables Realtime, and creates the triggers that send manager/customer push events. Keep the Vault secrets from step 6 in place.
8. Edit `supabase-config.js` and fill only the project URL, anon/publishable key, and VAPID **public** key:

   ```js
   window.STORE_CONFIG = {
     url: "https://YOUR_PROJECT_REF.supabase.co",
     anonKey: "YOUR_ANON_OR_PUBLISHABLE_KEY",
     pushPublicKey: "YOUR_VAPID_PUBLIC_KEY"
   };
   ```

9. Deploy the whole site folder to an HTTPS static host (for example, GitHub Pages, Cloudflare Pages, or Netlify). Do not use `file://` or a plain local HTTP address on a phone; push and browser location require HTTPS. Use the deployed URL for both manager and customer devices.
10. Open the deployed site on the manager's phone, open **Manager**, and sign in with the Supabase Auth email/password from step 2. In **Order notifications**, enter the `MANAGER_ENROLLMENT_CODE` from step 5, tap **Enable browser alerts**, and allow the notification prompt. Tap **Test sound and notification**. On iPhone/iPad, add the site to the Home Screen first if the browser requires it for push notifications.
11. Test with a customer device/browser: add products, enter customer details, choose a payment method, and confirm the order. The order should appear in Manager → **Customer orders**, which auto-refreshes every 15 seconds and also listens to Realtime. The manager phone receives a browser push if registered. The manager can review customer name, phone, address, items, and totals, then tap **Approve order**. The customer must tap **Notify me when the store approves this order** on the order-success screen and allow notifications to receive the approval push.

Hosted Supabase and static hosts offer free tiers with usage limits; this is not a guarantee of unlimited or permanently free hosting. Browser push itself has no per-message fee, but needs supported browsers, HTTPS, and permission; notification sound/vibration follows phone settings. SMS/calls to a phone number are not included. Static product/logo/offer/delivery settings remain in browser storage and do not sync to customers' devices in this version.
