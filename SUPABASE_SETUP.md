# Store manager and local preview

The live site uses Supabase project `kwnhoberdxqtzujwhudn`. The public URL and publishable key are configured in `supabase-config.js`. The order form remains disabled until the required database schema is installed. Manager access requires a Supabase Auth account whose user ID is listed in `public.store_managers`. Logo, product, offer, and delivery settings remain browser-local.

## Security limitation

Static credentials in a browser application are not secret: a visitor who inspects or downloads the page can find and bypass the check. The live build does not include a static manager password. Never put the service-role key, database password, or VAPID private key in frontend files.

## Finish connecting the existing Supabase project

The site is deployed at `https://siteshsdet.github.io/shanvi-gs/`. To activate shared order storage and Manager sign-in:

1. Sign in to Supabase and open project `kwnhoberdxqtzujwhudn`: `https://supabase.com/dashboard/project/kwnhoberdxqtzujwhudn`.
2. Open **SQL Editor → New query**. Copy the full contents of `supabase-setup.sql` from the GitHub repository into the editor and click **Run**.
3. Run `supabase-order-payment-update.sql` the same way.
4. Run `supabase/features.sql` last. The storefront checks for the order columns in these migrations and keeps customer checkout disabled until they exist.
5. In **Authentication → Users**, add a manager account using an email address you can access and a new password. Do not reuse the old demo password. Copy the new user's UUID.
6. In SQL Editor, run the following after replacing the placeholder with that user's UUID:

   ```sql
   insert into public.store_managers (user_id)
   values ('PASTE_MANAGER_USER_UUID')
   on conflict (user_id) do nothing;
   ```

7. Reload the live site. Sign in via **Manager** using that Supabase user's email/password. Place a test order from a second device and check **Customer orders**.

The publishable key in `supabase-config.js` is designed to be public; the database row-level security policies enforce access. Never share or publish your Supabase database password or service-role key. The order database works without push notifications; enabling phone push alerts requires the separate VAPID/Edge Function steps below.

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

HTML, CSS, and browser JavaScript cannot securely synchronize customer orders between different phones or deliver push notifications while the manager page is closed. That requires an online backend.

The public site requires Supabase for checkout and manager sign-in; orders are not saved locally as a fallback.

### Cross-device manager push setup

The Supabase project URL and publishable key are already configured on the live site. For immediate browser alerts, open the live site on the manager's phone, sign in, go to **Manager → Order notifications**, tap **Enable browser alerts**, and allow notifications. Keep the Manager page open and signed in; its Supabase Realtime subscription can notify the phone about orders placed on another device. Use **Test sound and notification** to check device permission. Mobile browsers may suspend a background page, so this does not guarantee an alert if the tab is closed or suspended.

For reliable Web Push when the Manager page is closed, the Edge Functions, VAPID keys, and server secrets below still need setup:

1. Generate Web Push keys (free) on a computer with Node.js:

   ```sh
   npx web-push generate-vapid-keys
   ```

   Save both generated keys privately. The public key goes in `supabase-config.js`; never put the VAPID private key or Supabase service-role key in frontend code.
2. Install/use the free Supabase CLI, sign in, and link this project from a terminal opened in the project folder:

   ```sh
   npx supabase login
   npx supabase link --project-ref kwnhoberdxqtzujwhudn
   npx supabase functions deploy register-manager-push --no-verify-jwt
   npx supabase functions deploy register-customer-push --no-verify-jwt
   npx supabase functions deploy notify-order
   ```
3. Add the server-only push secrets (replace the example values):

   ```sh
   npx supabase secrets set \
     MANAGER_ENROLLMENT_CODE="choose-a-long-random-code" \
     VAPID_PUBLIC_KEY="your-vapid-public-key" \
     VAPID_PRIVATE_KEY="your-vapid-private-key" \
     VAPID_SUBJECT="mailto:you@example.com"
   ```

4. In the Supabase SQL editor, save the project URL and **service-role key** in Supabase Vault for the database trigger. Replace placeholders; never paste these secrets into `index.html` or `supabase-config.js`:

   ```sql
   select vault.create_secret('https://kwnhoberdxqtzujwhudn.supabase.co', 'shanvi_supabase_url');
   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'shanvi_service_role_key');
   ```

5. Add the VAPID **public** key generated in step 1 to `supabase-config.js` and publish the change:

   ```js
   window.STORE_CONFIG = {
     url: "https://kwnhoberdxqtzujwhudn.supabase.co",
     anonKey: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY",
     pushPublicKey: "YOUR_VAPID_PUBLIC_KEY"
   };
   ```

6. Open the deployed site on the manager's phone. In **Order notifications**, enter the `MANAGER_ENROLLMENT_CODE` from step 3, tap **Enable browser alerts**, and allow the notification prompt. Tap **Test sound and notification**. On iPhone/iPad, add the site to the Home Screen first if the browser requires it for push notifications.
7. Test with a customer device/browser. Orders should appear in Manager → **Customer orders**, which refreshes every 15 seconds and listens to Realtime. The customer must opt in on the order-success screen to receive approval notifications.

Hosted Supabase and static hosts offer free tiers with usage limits; this is not a guarantee of unlimited or permanently free hosting. Browser push itself has no per-message fee, but needs supported browsers, HTTPS, and permission; notification sound/vibration follows phone settings. SMS/calls to a phone number are not included. Static product/logo/offer/delivery settings remain in browser storage and do not sync to customers' devices in this version.
