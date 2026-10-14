# Store manager and local preview

The live site is configured for Supabase project `zhrdeemyofcxxigqazgz`. The URL and publishable key are public client settings in `supabase-config.js`. Checkout stays disabled until the required order schema is installed. Manager access requires a Supabase Auth account whose user ID is listed in `public.store_managers`. Catalog, product images, logo, offer, delivery, festival banner, payment, and checkout settings are shared through Supabase and update on customer devices.

## Security limitation

Static credentials in a browser application are not secret: a visitor who inspects or downloads the page can find and bypass the check. The live build does not include a static manager password. Never put the service-role key, database password, or VAPID private key in frontend files.

## Finish connecting the existing Supabase project

The site is deployed at `https://siteshsdet.github.io/shanvi-gs/`. It uses project `zhrdeemyofcxxigqazgz`. To activate shared order storage and Manager sign-in:

1. Sign in to Supabase and open project `zhrdeemyofcxxigqazgz`: `https://supabase.com/dashboard/project/zhrdeemyofcxxigqazgz`.
2. Open **SQL Editor → New query**. Copy the full contents of `supabase-setup.sql` from the GitHub repository into the editor and click **Run**.
3. Run `supabase-order-payment-update.sql` the same way.
4. Run `supabase/features.sql`.
5. Run the latest `supabase/storefront-sync.sql` to add shared catalog display fields, enable live product/store setting updates, migrate existing Electronics products, and allow all current categories. Rerun it after deploying category/schema updates; it is safe to run repeatedly.
6. Run `supabase/order-payment-confirmation.sql` to finalize checkout columns and policies. Checkout remains disabled until all required order columns and policies are installed.
7. Run `supabase/order-manager-decisions.sql` to add the reason field used for declined orders.
8. Run `supabase/order-manager-delete.sql` to enable the manager-only permanent order deletion action.
9. In **Authentication → Users**, add a manager account using an email address you can access and a new password. Do not reuse the old demo password. Copy the new user's UUID.
10. In SQL Editor, run the following after replacing the placeholder with that user's UUID:

   ```sql
   insert into public.store_managers (user_id)
   values ('PASTE_MANAGER_USER_UUID')
   on conflict (user_id) do nothing;
   ```

11. Redeploy the customer order status function so customers can see a manager's rejection reason:

   ```sh
   npx supabase functions deploy get-customer-order --no-verify-jwt --project-ref zhrdeemyofcxxigqazgz
   ```

12. Reload the live site. Tap the **Shanvi General Store** name six times within four seconds to open Manager, then sign in using that Supabase user's email/password. Place a test order from a second device and check **Customer orders**.

Customers can open **Profile** to see their order details; while Profile is open, order statuses refresh automatically about every 12 seconds, including accepted and rejected updates. Customers can copy an order ID/details or open a prefilled WhatsApp message to the store at `+91 97989 87872`. New order IDs use `SNVGS-<last 4 phone digits>-<unique suffix>` so the manager can recognize the customer without exposing the full phone number in the ID. In **Manager → Customer orders**, search by any part of the customer's phone number or order ID; phone matching is partial and searches all matching orders. Since customer sign-in is not enabled, order history and its private status-check token are kept in that browser only; order history is not shared across devices or browsers. The manager can save or change the customer-facing phone number in **Manager → Help & contact**, and customers can call it from **Help**. That contact, catalog, product images, offer, logo, delivery, and banner settings are shared through Supabase after the required SQL setup.

The publishable key in `supabase-config.js` is designed to be public; the database row-level security policies enforce access. Never share or publish your Supabase database password or service-role key. The order database works without push notifications; enabling phone push alerts requires the separate VAPID/Edge Function steps below.

## Managing the catalog

Open Manager by tapping the **Shanvi General Store** name six times within four seconds, then enter the manager credentials. Add products with their category (Kids, Gifts, Stationery, Puja, Gharelu Samaan, Snacks, Beauty & Personal Care, Electrical & Electronics, Clothing, or Grocery), name, selling price, MRP, stock, optional size and dimensions, description, and photo. Choose a photo from the device or use **Take photo with camera** on a camera-capable device; images are resized locally before being shared through Supabase Storage. The product preview shows the current crop. Choose Fill frame or Show full image, adjust the frame width-to-height ratio, zoom, and horizontal/vertical position; those settings are saved with the product and reflected on customer devices. Use the **×** in the preview to remove a photo. To enable saved frame ratios, run the updated `supabase/storefront-sync.sql` migration in the Supabase SQL Editor. Product changes are saved to the shared catalog and appear on all customer devices, live while the storefront is open. The manager's existing local catalog is published the first time an authorized manager signs in if the shared catalog is empty. The manager's product list is grouped by section and has a section filter, plus Edit and Remove controls. Use **Save all changes** at the top of Manager to save pending changes across the product editor and manager settings.

Use **Festival banner** to set the small heading, main headline, customer message, and background photo. The live preview shows the banner's center-crop; a wide landscape **16:6** image, ideally **1600 × 600 px**, gives the best fit. The customer-page photo uses a gentle animated zoom/pan with animated festival sparkles, with a dark overlay for readable text. Product and banner photos are resized locally before upload to Supabase Storage. In the product editor, use **Remove product photo** to clear the current/selected photo; an item without a photo uses its category placeholder. Banner, product details, logo, and free-item offer are shared with customers' devices; all configured storefronts require the `storefront-sync.sql` migration.

In **Payment details**, set a store UPI ID, choose a QR image, and toggle COD. Saving these settings shares them through Supabase with all customers; after this update, save payment details once from Manager to publish the values (the older version kept them only in the manager's browser). For UPI ID orders, customers enter their UPI ID and tap **Continue to pay in UPI app**. For QR orders, they tap **Start QR payment** and scan the code. After paying, they tap **I have completed payment**; only then is **Confirm order** enabled. This button records the customer's statement, not verified payment. The manager must check the payment account before accepting. Managers can accept a UPI order as **Cash on delivery** if appropriate. The included UPI ID and QR are sample data for demonstration only; do not send money to them. Replace them with the store's real payment details before using payment options.

An order appears in **Customer orders** only after it is successfully saved. UPI orders require the customer to confirm payment before submission; this does not prove payment succeeded. The manager must verify payment manually. With Supabase configured, orders remain **Awaiting manager approval** until an authorized manager accepts them.

The customer Profile shows **Pending** in red, **In Progress** in yellow after the manager accepts the order, **Completed** in green, and rejected orders with the manager's reason. Customer status changes are checked when the customer taps **Refresh orders**. The Manager order list is at the bottom of the manager tools. Its **Pending**, **Completed**, **Rejected**, and **All** filters separate orders by status. The manager can **Accept** with the original payment method, **Accept as COD**, or **Reject** and provide a reason. Accepted orders can then be marked **Delivered** and **Complete**. Managers can permanently delete an order using **Delete order**, then explicitly confirm **Delete** or choose **Cancel**. Status changes are saved in Supabase when connected, or in this browser in local/demo mode.

## Storefront options

- **Logo:** in Manager, upload a square image and save it. It is resized and shared through Supabase Storage.
- **Free-item offer:** choose an integer minimum basket amount and a product to give free. The threshold is checked against the item subtotal after the existing coupon discount and before delivery. One free unit is added to eligible baskets; it counts against available stock. Offer settings are shared with all customers.
- **Coupon:** enable or disable the `WELCOME10` coupon and set its percentage and maximum discount in Manager. Customers see a celebration when the coupon is applied. Coupon settings are shared with all customers.
- **Inventory:** tracked products show remaining units to customers and cannot be added beyond the saved stock. Manager stock edits are shared with all customers.
- **Delivery:** customers receive free delivery when their item subtotal after coupon discounts is ₹100 or more. Orders below ₹100 have a flat ₹20 delivery charge. The fee is shown in the basket and checkout before customers place an order; no location permission is requested.
- The top announcement strip has been removed; the English/Hindi button is beside the cart.

## Free-tier orders, approvals, and push notification setup

Push alerts need an online Supabase project and an HTTPS deployment; they cannot be delivered by browser-local storage alone. Only orders successfully inserted into Supabase can trigger push. Supabase and the Web Push protocol have free/open-source options, but free tiers and mobile browser policies can change. iPhone web push generally requires the manager site to be installed to the Home Screen and notification permission granted.

HTML, CSS, and browser JavaScript cannot securely synchronize customer orders between different phones or deliver push notifications while the manager page is closed. That requires an online backend.

The public site requires Supabase for checkout and manager sign-in; orders are not saved locally as a fallback. UPI payments currently open the customer's UPI app (or display a QR); checkout explains how to check the recipient, pay the exact shown total, and confirm payment. Customers must confirm they paid before placing an order, and the store must still verify the payment manually. This is not a payment-gateway integration or automatic payment confirmation. Managers can accept an order as COD instead or reject it with a reason, which appears in the customer's Profile after the updated status function is deployed.

### Cross-device manager push setup

The Supabase project URL and publishable key are already configured on the live site. For immediate browser alerts, open the live site on the manager's phone, sign in, go to **Manager → Order notifications**, tap **Enable browser alerts**, and allow notifications. Keep the Manager page open and signed in; its Supabase Realtime subscription can notify the phone about orders placed on another device. Use **Test sound and notification** to check device permission. Mobile browsers may suspend a background page, so this does not guarantee an alert if the tab is closed or suspended.

The optional manager phone field is stored in that browser only as a contact/setup reminder. It does not send SMS or calls: those require a separately configured messaging provider and credentials. Browser alerts are sent to the device that granted permission; entering a number does not enroll another phone.

The Web Push functions, VAPID keypair, server secrets, and database Vault values are already configured for the live project. To enroll a manager phone, open the live HTTPS store, sign in as manager, and enter the current enrollment code under **Manager → Order notifications**. On Android use Chrome and allow notifications. On iPhone/iPad use Safari, choose **Share → Add to Home Screen**, open the installed store icon, then allow notifications. Tap **Enable browser alerts** and wait for the push-enabled confirmation; use **Test sound and notification** to check the device. OS notification settings, Focus/Do Not Disturb, battery policies, and browser support can still block alerts.

The following steps are only needed to install the backend from scratch or rotate the VAPID keypair; they are not needed to enroll this phone. If you only need a replacement enrollment code, update `MANAGER_ENROLLMENT_CODE` in Supabase **Edge Functions → Secrets**. Do not put it in frontend files or publish it:

1. Generate a new VAPID keypair only if rotating the existing one (free) on a computer with Node.js:

   ```sh
   npx web-push generate-vapid-keys
   ```

   Save both generated keys privately. The public key goes in `supabase-config.js`; never put the VAPID private key or Supabase service-role key in frontend code.
2. Install/use the free Supabase CLI, sign in, and link this project from a terminal opened in the project folder:

   ```sh
   npx supabase login
   npx supabase link --project-ref zhrdeemyofcxxigqazgz
   npx supabase functions deploy register-manager-push --no-verify-jwt
   npx supabase functions deploy register-customer-push --no-verify-jwt
   npx supabase functions deploy get-customer-order --no-verify-jwt
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
   select vault.create_secret('https://zhrdeemyofcxxigqazgz.supabase.co', 'shanvi_supabase_url');
   select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'shanvi_service_role_key');
   ```

5. Add the VAPID **public** key generated in step 1 to `supabase-config.js` and publish the change:

   ```js
   window.STORE_CONFIG = {
     url: "https://zhrdeemyofcxxigqazgz.supabase.co",
     anonKey: "YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY",
     pushPublicKey: "YOUR_VAPID_PUBLIC_KEY"
   };
   ```

6. Open the deployed site on the manager's phone. Tap the **Shanvi General Store** name six times within four seconds, then in **Order notifications** enter the `MANAGER_ENROLLMENT_CODE` from step 3, tap **Enable browser alerts**, and allow the notification prompt. Tap **Test sound and notification**. On iPhone/iPad, add the site to the Home Screen first if the browser requires it for push notifications.
7. Customers can opt in on the order-success screen to receive approval/rejection notifications. Customer order statuses in **Profile** refresh automatically while that panel is open.

Hosted Supabase and static hosts offer free tiers with usage limits; this is not a guarantee of unlimited or permanently free hosting. Browser push itself has no per-message fee, but needs supported browsers, HTTPS, and permission; notification sound/vibration follows phone settings. SMS/calls to a phone number are not included.
