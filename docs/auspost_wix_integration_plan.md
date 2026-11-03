# Australia Post Shipping Rates, Fulfillment, Label Generation & Shipment Management Plan for Wix

This implementation blueprint extends the [Wix Self-Hosted Custom Shipping Rates App Tutorial](https://dev.wix.com/docs/build-apps/get-started/tutorials/tutorial-create-a-self-hosted-custom-shipping-rates-app.md) and the [Wix Custom Shipping Rates App Template](https://github.com/wix/app-template-custom-shipping-rates) into a full-featured **Australia Post Checkout Rating, Order Fulfillment, Label Generation, Manifesting, and Tracking Application** built on Next.js (App Router) and the [Wix JavaScript SDK](https://dev.wix.com/docs/sdk.md).


## 1. Architectural Overview & Dual-API Strategy

Extending the base tutorial from static per-item rates to live Australia Post rating and end-to-end fulfillment requires connecting two distinct Australia Post API suites alongside four Wix platform capabilities:

| Functional Domain | Australia Post API Suite | Wix Platform Integration | Purpose in the App Lifecycle |
| :--- | :--- | :--- | :--- |
| **Retail Checkout Rates (No Contract)** | [Postage Assessment Calculator (PAC) API](https://developers.auspost.com.au/apis/pac/reference) | [Wix Shipping Rates Service Plugin](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/introduction.md) | Calculates standard retail postage rates for domestic and international letters/parcels using an `AUTH-KEY` header when a merchant does not use contract pricing. |
| **Contract Checkout Rates (eParcel / StarTrack)** | [Get Shipment Price API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-shipment-price) (`shipping/v1/prices/shipments`) | [Get Shipping Rates Endpoint](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/get-shipping-rates.md) | Calculates merchant-specific contracted postage rates, fuel surcharges, and transit cover using HTTP Basic Auth (`API Key` + `Password`) and the 10-digit `Account-Number` header. |
| **Account & Product Discovery** | [Get Accounts API](https://developers.auspost.com.au/apis/shipping-and-tracking/info/integration/workflows) (`shipping/v1/accounts/{account_number}`) & [Validate Suburb API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/validate-suburb) | [Wix Dashboard SDK](https://dev.wix.com/docs/sdk/host-modules/dashboard/introduction.md) | Validates the merchant's charge account, retrieves active contract product codes (such as Parcel Post `7D55` or Express Post `3D55`), and verifies Australian suburb/state/postcode combinations. |
| **Shipment Creation & Editing** | [Create Domestic Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-shipments), [Create International Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-international-shipments), [Get Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-shipments), & [Delete Shipment](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/delete-shipment) | [Wix eCommerce Orders API](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/introduction) & [Order Approved Webhook](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/order-approved) | Converts approved Wix orders into Australia Post shipments (supporting single-parcel, multi-parcel up to 20 domestic items, split shipments, safe drop, and customs declarations) and returns `shipment_id`, `consignment_id`, and `article_id`. |
| **Label Generation & Printing** | [Create Labels API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-labels) & [Get Label API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-label) | Wix Dashboard Fulfillment UI | Requests asynchronous PDF or ZPL thermal labels (`A4-1pp`, `A4-3pp`, or `A6-1pp`), polls label generation status (`Pending` to `Available`), and provides single or batch label download/print links. |
| **Order Fulfillment & Buyer Notification** | Australia Post `consignment_id` / `article_id` from [Get Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-shipments) | [Wix Create Fulfillment API](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/create-fulfillment) & [Update Fulfillment API](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/update-fulfillment) | Pushes the generated Australia Post tracking number and carrier details back to Wix so the Wix order transitions to `FULFILLED` (or `PARTIALLY_FULFILLED`) and triggers buyer shipping notification emails. |
| **End-of-Day Manifesting (Order Summary)** | [Create Order From Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-order-from-shipments) & [Get Order Summary](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-order-summary) | Wix Dashboard Manifest Manager | Groups unmanifested daily shipments into a locked Australia Post Order (`order_id`) prior to carrier pickup and downloads the printable PDF Order Summary (Manifest) required by the pickup driver. |
| **Live Parcel Tracking & Exceptions** | [Track Items API](https://developers.auspost.com.au/content/apis/shipping-and-tracking/reference-track-items.html) (`shipping/v1/track`) | Wix Dashboard Shipment Monitor | Queries live scan events by `article_id` or `consignment_id` (separated by Australia Post vs. StarTrack consignments) to display delivery progress and exceptions inside the merchant dashboard. |


## 2. Project Structure Expansion Plan (From Base Tutorial to Full Solution)

In the reference [Wix Custom Shipping Rates Tutorial](https://dev.wix.com/docs/build-apps/get-started/tutorials/tutorial-create-a-self-hosted-custom-shipping-rates-app.md), the Next.js project only includes `getRates`, basic `app-data` actions, and a single rate form. To support Australia Post rating, shipments, labels, manifests, and tracking, expand the folder hierarchy as follows:

| Directory / File Path | Role in Expanded Architecture | Evolution from Reference Tutorial |
| :--- | :--- | :--- |
| `src/app/types/app-data.model.ts` | Defines merchant configuration models: Australia Post credentials, sender warehouse address, box sizes/satchels, active postage product codes, handling fees, and fallback rules. | Replaces the static `ShippingMethodType` and `ShippingCosts` interfaces with live carrier settings and parcel preset schemas. |
| `src/app/types/shipment.model.ts` | Defines data models for Australia Post Shipments, Items, Articles, Label Requests (`A4-1pp`, `A4-3pp`, `A6-1pp`), Customs Declarations, Manifest Orders, and Tracking Events. | **New file** dedicated to post-checkout fulfillment, label generation, and manifest lifecycle states. |
| `src/app/utils/wix-sdk.app.ts` | Initializes `wixAppClient` using [AppStrategy](https://dev.wix.com/docs/sdk/core-modules/sdk/app-strategy.md) with `@wix/ecom` (`orders`, `orderFulfillments`, `shippingRates`) and `@wix/webhooks`. | Expands the tutorial's basic `wixAppClient` by registering `orders` and `orderFulfillments` modules alongside `shippingRates`. |
| `src/app/utils/wix-sdk.client-only.ts` | Initializes the client-side [Dashboard SDK](https://dev.wix.com/docs/sdk/host-modules/dashboard/introduction.md) inside the Wix iframe (`showToast`, `navigate`, `getAccessToken`). | Retains the tutorial setup and adds modal/navigation helpers for order fulfillment workflows. |
| `src/app/utils/auspost-client.ts` | Server-side HTTP client wrapper for Australia Post's [PAC API](https://developers.auspost.com.au/apis/pac/reference) and [Shipping & Tracking API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference) (handling Test Bed vs. Production base URLs, Basic Auth encoding, `Account-Number` formatting with 10-digit zero-padding, rate-limit retries, and error parsing). | **New file** encapsulating all outbound communication with Australia Post endpoints. |
| `src/app/utils/box-packer.ts` | Cartonization and parcel dimension calculator that aggregates Wix cart line items (weight and dimensions) into one or more Australia Post parcels or prepaid satchels (enforcing the 20-item domestic limit and 1-item international consignment constraint). | Replaces the tutorial's `shipping-calculator.ts` with physical weight/volume aggregation and package splitting. |
| `src/app/actions/app-data.ts` | Server actions to read/write multi-tenant merchant configuration (keyed by Wix `instanceId`) and encrypted Australia Post credentials in a persistent database. | Upgrades the tutorial's in-memory `defaultAppData` object to persistent per-instance database storage. |
| `src/app/actions/auspost-shipments.ts` | Server actions orchestrating shipment creation, shipment modification/deletion, price pre-validation, and syncing with Wix [Order Fulfillments API](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/create-fulfillment). | **New file** driving the merchant's single and bulk shipment workflows. |
| `src/app/actions/auspost-labels.ts` | Server actions for triggering [Create Labels](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-labels), polling [Get Label](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-label), storing PDF URLs, and re-printing labels. | **New file** managing asynchronous label generation and print layout selection. |
| `src/app/actions/auspost-manifests.ts` | Server actions for batching unmanifested shipments into an Australia Post Order via [Create Order From Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-order-from-shipments) and retrieving the PDF manifest via [Get Order Summary](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-order-summary). | **New file** managing end-of-day dispatch and driver handover documents. |
| `src/app/actions/auspost-tracking.ts` | Server actions for querying [Track Items](https://developers.auspost.com.au/content/apis/shipping-and-tracking/reference-track-items.html) and updating internal shipment delivery states. | **New file** providing live tracking timelines and exception alerts. |
| `src/app/api/shipping-rates/v1/getRates/route.ts` | Next.js Route Handler for the [Wix Get Shipping Rates Service Plugin](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/get-shipping-rates.md) that queries live Australia Post rates at cart/checkout. | Replaces the static `costs.first` mapping with real-time Australia Post PAC or Contract Shipment Price calls. |
| `src/app/api/webhooks/v1/orders/route.ts` | Webhook endpoint handling [Order Approved](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/order-approved) and [Order Canceled](https://dev.wix.com/docs/build-apps/develop-your-app/develop-a-self-managed-app/webhooks/handle-events-with-webhooks-for-self-hosting-using-the-java-script-sdk) events from Wix eCommerce. | **New file** that queues approved orders for Australia Post fulfillment and auto-deletes unmanifested draft shipments when an order is canceled. |
| `src/app/dashboard/page.tsx` & `src/app/dashboard/parts/*` | Multi-tab Wix Design System dashboard covering **Orders & Shipments**, **Batch Labels**, **Manifests (End-of-Day)**, **Live Tracking**, and **Carrier & Box Settings**. | Expands the single-view tutorial dashboard into a multi-tab operational shipping hub. |


## 3. Step-by-Step Implementation Plan

### Phase 1: Prerequisites, Australia Post Onboarding & Wix App Setup

1. **Register for Australia Post API Credentials**:
   - Sign in to the [Australia Post Developer Centre](https://developers.auspost.com.au/apis) and request access based on the merchant tier:
     - **Retail Rates Only**: Register for a free [Postage Assessment Calculator (PAC) API](https://developers.auspost.com.au/apis/pac/) key (`AUTH-KEY`).
     - **Contract Rates, Shipments, Labels & Manifests**: Register for the [Shipping and Tracking API](https://developers.auspost.com.au/apis/shipping-and-tracking/info/integration/workflows) (`https://developers.auspost.com.au/apis/st-registration`) using the merchant's 10-digit Australia Post eParcel or StarTrack charge account number (pad with leading zeros if shorter than 10 digits).
   - Retrieve the encrypted provisioning PDF (unlocked using the merchant's Australia Post Customer Number / APCN) containing the **API Key (Username)**, **API Password**, and **Test Bed / Production Account Number**.
2. **Create and Configure the App in Wix Studio**:
   - Following Step 1 of the [Wix Custom Shipping Rates Tutorial](https://dev.wix.com/docs/build-apps/get-started/tutorials/tutorial-create-a-self-hosted-custom-shipping-rates-app.md), create a new app in the [Wix Custom Apps Dashboard](https://manage.wix.com/account/custom-apps) to obtain `WIX_APP_ID`, `WIX_APP_SECRET`, and the base64-encoded `WIX_APP_JWT_KEY`.
   - In the Wix App Dashboard under **Permissions**, add permissions required beyond the base tutorial:
     - **Wix eCommerce — Manage Orders** and **Read Orders** (required for reading buyer addresses/line items and calling [Create Fulfillment](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/create-fulfillment) and [Update Fulfillment](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/update-fulfillment)).
     - **Wix eCommerce — Provide Shipping Rates** (required for the [Shipping Rates Integration Service Plugin](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/introduction.md)).
3. **Configure Environment & Database Persistence**:
   - Store app-level secrets (`WIX_APP_ID`, `WIX_APP_SECRET`, `WIX_APP_JWT_KEY`, plus an encryption key for merchant credentials) in `.env.local` and your hosting provider.
   - Replace the tutorial's in-memory `defaultAppData` variable with a persistent database keyed by `instanceId` containing four collections/tables:
     - `MerchantSettings`: Australia Post mode (`SANDBOX` vs. `PRODUCTION`, `PAC_RETAIL` vs. `CONTRACT_SHIPPING`), encrypted API Key/Password, 10-digit Account Number, PAC `AUTH-KEY`, sender address (`MERCHANT_LOCATION`), default label layout (`A4-1pp`, `A4-3pp`, `A6-1pp`), package presets, handling markups, and fallback flat rates.
     - `Shipments`: Maps Wix `orderId` to Australia Post `shipment_id`, `consignment_id`, `article_id` list, `barcode_id`, shipment status (`CREATED`, `LABEL_PENDING`, `LABEL_AVAILABLE`, `MANIFESTED`, `CANCELLED`), and Wix `fulfillmentId`.
     - `Labels`: Stores label request IDs (`request_id`), layout format, label status, and temporary/cached PDF download URLs.
     - `ManifestOrders`: Stores Australia Post `order_id`, manifest creation timestamp, shipment count, total GST-inclusive cost, and PDF Order Summary storage status.


### Phase 2: Merchant Onboarding, Account Discovery & Settings Dashboard

1. **Build the Carrier Connection & Suburb Validation Flow**:
   - In the dashboard settings tab, provide fields for the merchant's Australia Post **Account Number** (auto-padded to 10 digits), **API Key**, **API Password**, optional **PAC API Key**, and environment toggle (**Developer Test Bed** `digitalapi.auspost.com.au/test/...` vs. **Production** `digitalapi.auspost.com.au/...`).
   - Add a **Verify & Sync Account** action that calls [Get Accounts](https://developers.auspost.com.au/apis/shipping-and-tracking/info/integration/workflows) (`GET /shipping/v1/accounts/{account_number}`) to:
     - Confirm the credentials and charge account are valid.
     - Automatically pull the merchant's registered lodgement/sender address (`MERCHANT_LOCATION`, which Australia Post requires the `from` address to match) and active postage products (domestic and international `product_id` codes, tariff rates, and features like `TRANSIT_COVER`).
   - Validate any custom sender/return address entered by the merchant using the [Validate Suburb API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/validate-suburb) (`GET /shipping/v1/address?suburb=...&state=...&postcode=...`) to prevent shipment creation failures later.
2. **Configure Checkout Services, Satchels & Box Presets**:
   - Allow the merchant to toggle which discovered Australia Post services appear at Wix checkout (e.g., **Parcel Post**, **Express Post**, **International Standard**, **International Express**, **StarTrack Express**).
   - Provide a **Packages & Satchels** manager where merchants configure:
     - Custom box dimensions (`length`, `width`, `height` in cm, tare weight in kg, max weight).
     - Official Australia Post Prepaid Satchels (Small, Medium, Large, Extra Large).
     - A default fallback item weight and dimension (used when a Wix product is missing physical dimensions or weight).
   - Provide **Rate Adjustment & Fallback Rules**:
     - Optional handling fee (flat AUD amount or percentage markup/discount).
     - Free shipping threshold per service type.
     - Emergency fallback flat rates if the Australia Post API times out during checkout.


### Phase 3: Real-Time Australia Post Shipping Rates at Checkout

1. **Receive and Normalize the Wix Service Plugin Request**:
   - In `src/app/api/shipping-rates/v1/getRates/route.ts`, handle the incoming POST request via `wixAppClient.shippingRates.provideHandlers({ getShippingRates })` as shown in Step 4 of the [Wix Custom Shipping Rates Tutorial](https://dev.wix.com/docs/build-apps/get-started/tutorials/tutorial-create-a-self-hosted-custom-shipping-rates-app.md).
   - Extract `metadata.instanceId` and `metadata.currency`, along with `request.lineItems` (quantities, weights, dimensions, prices) and `request.shippingDestination` (suburb/city, state/subdivision, postalCode, country).
2. **Perform Unit Conversion & Cartonization (Box Packing)**:
   - Convert Wix weight units (`LB`, `KG`, `G`, `OZ`) to **kilograms (kg)** and dimension units (`IN`, `CM`) to **centimetres (cm)** as required by Australia Post.
   - Apply the `box-packer` logic to group cart items into parcels:
     - **Domestic shipments (`country === 'AU'`)**: Pack items into the merchant's defined boxes/satchels, respecting Australia Post's maximum limit of **20 items per domestic shipment** and maximum physical weight/cubic limits.
     - **International shipments (`country !== 'AU'`)**: Consolidate items into a single parcel per consignment, respecting Australia Post's constraint that **international consignments must contain exactly 1 item element** per shipment request.
3. **Query Live Rates from Australia Post (Contract vs. Retail)**:
   - **Route A — Contract Merchants ([Get Shipment Price API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-shipment-price))**:
     - Send `POST /shipping/v1/prices/shipments` with the merchant's `from` address, buyer's `to` address (supporting `STANDARD_ADDRESS`, `PARCEL_LOCKER`, and `PARCEL_COLLECT`), and packed `items` array.
     - Omit `product_id` in the pricing call (or pass enabled `product_id` codes) to retrieve contract rates, fuel surcharges, GST, and `TRANSIT_COVER` across all eligible services on the billing account in a single request.
   - **Route B — Retail / Non-Contract Merchants ([PAC API](https://developers.auspost.com.au/apis/pac/reference))**:
     - For domestic destinations, call `GET /postage/parcel/domestic/service.json` with `from_postcode`, `to_postcode`, `length`, `width`, `height`, and `weight`.
     - For international destinations, call `GET /postage/parcel/international/service.json` with `country_code` and `weight`.
   - Implement a short-TTL cache (e.g., 5 minutes keyed by `instanceId + destinationPostcode + country + packedParcelHash`) so repeated cart updates do not trigger redundant API calls.
4. **Format and Return the Wix `shippingRates` Response**:
   - Filter returned services against the merchant's enabled checkout methods, apply any configured handling fees or free-shipping thresholds, and map each option to the [Wix Get Shipping Rates response schema](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/extensions/shipping-rates/shipping-rates-integration-service-plugin/get-shipping-rates.md):
     - `code`: e.g., `auspost-7D55` or `auspost-3D55` (storing the exact Australia Post `product_id` in the code so the order webhook knows which service the buyer selected).
     - `title`: e.g., `Australia Post — Parcel Post` or `Australia Post — Express Post`.
     - `logistics.deliveryTime`: Estimated transit window (e.g., `1–3 business days` for Express, `2–5 business days` for Parcel Post).
     - `cost.price` and `cost.currency`: Total calculated rate in `metadata.currency`.
   - If the Australia Post API is unreachable or returns an address validation error, either return the merchant's configured fallback rates or return descriptive error/empty rates so checkout is never blocked.


### Phase 4: Order Synchronization & Shipment Lifecycle Management

1. **Ingest Approved & Canceled Wix Orders**:
   - Subscribe to the Wix eCommerce [Order Approved](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/order-approved) and [Order Canceled](https://dev.wix.com/docs/build-apps/develop-your-app/develop-a-self-managed-app/webhooks/handle-events-with-webhooks-for-self-hosting-using-the-java-script-sdk) webhooks in the Wix App Dashboard, pointing to `src/app/api/webhooks/v1/orders/route.ts`.
   - Also support on-demand order retrieval in the dashboard using [`orders.searchOrders()`](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/search-orders.md) from `@wix/ecom` (expanding the `src/app/actions/orders.ts` pattern from the reference template).
   - When an order is approved (`status: "APPROVED"`), parse the selected shipping rate `code` to pre-select the corresponding Australia Post `product_id`, extract recipient delivery instructions, and check whether the destination is a `STANDARD_ADDRESS`, `PARCEL_LOCKER`, or `PARCEL_COLLECT`.
2. **Pre-Validate & Enrich Shipment Details in the Dashboard**:
   - In the **Orders & Shipments** dashboard tab, allow the merchant to review or edit shipment parameters before lodging with Australia Post:
     - **Package & Multi-Parcel Splitting**: Add/remove parcels (up to 20 items for domestic Parcel Post / Express Post), select a preset box/satchel, or override `length`, `width`, `height`, and `weight`.
     - **Delivery Options & Features**: Toggle **Authority to Leave (Safe Drop)** (`authority_to_leave: true/false`), **Partial Delivery** (`allow_partial_delivery`), **Email Tracking Notifications** (`email_tracking_enabled: true`, which requires the recipient's email address), **Dangerous Goods** declaration (`contains_dangerous_goods`), and **Transit Cover** (`TRANSIT_COVER` amount).
     - **International Customs Declarations**: When shipping outside Australia, present mandatory customs fields required by [Create International Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-international-shipments): `commercial_value` boolean, `classification_type` (`GIFT`, `SAMPLE`, `DOCUMENT`, `RETURN`, `SALE_OF_GOODS`, `OTHER`), `description_of_other`, `export_declaration_number` (EDN, required when contents exceed AUD $2,000), `non_delivery_action` (`RETURN` or `ABANDONED`), and per-line `item_contents` (HS tariff code, country of origin, quantity, weight, value, and description).
3. **Create Domestic & International Shipments in Australia Post**:
   - Trigger [Create Domestic Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-shipments) (`POST /shipping/v1/shipments`) or [Create International Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-international-shipments) for single or bulk selected Wix orders.
   - Persist the returned `shipment_id`, per-parcel `item_id`, `tracking_details.consignment_id`, `tracking_details.article_id`, `tracking_details.barcode_id`, and `shipment_summary` pricing (total cost, fuel surcharge, GST) in the `Shipments` table.
4. **Support Shipment Modification & Cancellation (Pre-Manifest)**:
   - As documented in the [Australia Post Shipping & Tracking FAQ](https://developers.auspost.com.au/apis/shipping-and-tracking/info/api-resources/faq), a shipment can be modified or deleted **only before** it is added to an Order (Manifest).
   - Provide a **Void / Delete Shipment** action in the dashboard (and trigger it automatically on Wix `onOrderCanceled` webhooks) that calls [Delete Shipment](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/delete-shipment) (`DELETE /shipping/v1/shipments/{shipment_id}`) or [Delete Item](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/delete-item) (`DELETE /shipping/v1/shipments/{shipment_id}/items/{item_id}`) if the merchant needs to adjust parcel dimensions or cancel an unmanifested shipment.


### Phase 5: Shipping Label Generation & Batch Printing Workflow

1. **Configure Label Layout & Format Preferences**:
   - Support all official Australia Post print layouts validated by the [Create Labels API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-labels):
     - **`A4-1pp`**: 1 label per A4 page (supported for Parcel Post, Express Post, and International).
     - **`A4-3pp`**: 3 labels per A4 page (supported for domestic Parcel Post and Express Post).
     - **`A6-1pp`**: 1 thermal label per A6 page (`100mm x 150mm`, supported for Parcel Post, Express Post, and StarTrack thermal printers).
   - Allow merchants to configure `branded: true/false` (whether Australia Post branding appears on the label) and page margins (`left_offset`, `top_offset`).
2. **Execute Asynchronous Label Generation**:
   - Following the [Australia Post Recommended Workflow](https://developers.auspost.com.au/apis/shipping-and-tracking/info/integration/workflows), always generate and print labels **before** creating the manifest order for pickup.
   - Send `POST /shipping/v1/labels` ([Create Labels](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-labels)) passing the `preferences` block and an array of `shipments` (either a single `shipment_id` or a batch of `shipment_id`s for bulk printing, optionally scoped to specific `items`).
   - Store the returned label `request_id` and initial status (`Pending`).
3. **Poll Label Status & Deliver Printable PDFs**:
   - Poll `GET /shipping/v1/labels/{request_id}` ([Get Label](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-label)) until the status transitions from `Pending` to `Available` (or `Error`).
   - Once `Available`, capture the temporary `url` (which returns `application/pdf` content) and surface **Print / Download Label** and **Batch Print Selected Labels** buttons in the Wix Dashboard.
   - Store the label metadata against the shipment so merchants can re-print labels from the dashboard without creating duplicate shipments.


### Phase 6: Automated Wix Order Fulfillment & Tracking Sync

1. **Create Fulfillment Records in Wix eCommerce**:
   - Automatically upon label generation (or when the merchant clicks **Mark Fulfilled**), call the Wix [Create Fulfillment API](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/create-fulfillment) (`POST /ecom/v1/fulfillments/orders/{orderId}` via `@wix/ecom` `orderFulfillments.createFulfillment`).
   - Verify the Wix order has `status: "APPROVED"` (a mandatory prerequisite of the Wix Order Fulfillments API).
   - Pass the fulfilled `lineItems` (`id` and `quantity`—supporting both full-order fulfillment and split/partial fulfillment across multiple Australia Post shipments) and `trackingInfo`:
     - `trackingNumber`: The Australia Post `article_id` (or `consignment_id`).
     - `shippingProvider`: `"australiaPost"` (or custom provider name with explicit `trackingLink`: `https://auspost.com.au/mypost/track/#/details/{article_id}`).
   - Note that Wix automatically recalculates the order's `fulfillmentStatus` (`FULFILLED` or `PARTIALLY_FULFILLED`) and dispatches the site's buyer shipping confirmation email with the tracking link.
2. **Support Fulfillment Updates & Corrections**:
   - If a merchant voids and recreates an unmanifested shipment with a new `article_id`, call the Wix [Update Fulfillment API](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/order-fulfillments/update-fulfillment) (`PATCH /ecom/v1/fulfillments/{fulfillmentId}/orders/{orderId}`) to update `trackingInfo.trackingNumber` and `trackingInfo.trackingLink`.


### Phase 7: End-of-Day Manifesting (Order Summary) & Driver Handover

1. **Group Unmanifested Shipments into an Australia Post Order**:
   - As explained in the [Australia Post Integration Workflows](https://developers.auspost.com.au/apis/shipping-and-tracking/info/integration/workflows) and [FAQ](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/faq.html), shipments created via the API **do not appear in eParcel** and cannot be lodged until they are combined into an Order (Manifest) prior to daily carrier pickup.
   - In the **Manifests (End-of-Day)** dashboard tab, list all labeled, unmanifested shipments ready for dispatch.
   - Provide a **Create End-of-Day Manifest** action (with a clear confirmation modal reminding the merchant that once shipments are added to an Australia Post Order, neither the Order nor its shipments can be deleted or voided online).
   - Call [Create Order From Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-order-from-shipments) (`PUT /shipping/v1/orders`) passing the list of `shipment_id`s and optional `order_reference` / `payment_method`.
2. **Generate and Print the PDF Order Summary Report (Manifest)**:
   - Once [Create Order From Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-order-from-shipments) returns the `order_id` and order summary pricing, call [Get Order Summary](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-order-summary) (`GET /shipping/v1/accounts/{account_number}/orders/{order_id}/summary`).
   - Stream and store the returned PDF **Order Summary Report**, and provide a **Print Manifest for Driver** button so the merchant can print, sign, and hand the physical manifest to the Australia Post pickup driver or lodgement counter.


### Phase 8: Live Parcel Tracking & Exception Monitoring

1. **Query Live Tracking Events**:
   - Once an Australia Post Order (Manifest) is created, tracking events become active for each shipment's `article_id` and `consignment_id`.
   - Implement a background sync and on-demand refresh using the [Track Items API](https://developers.auspost.com.au/content/apis/shipping-and-tracking/reference-track-items.html) (`GET /shipping/v1/track?tracking_ids=...`), batching up to 10 tracking IDs per request and keeping Australia Post article IDs separate from StarTrack consignment IDs (as required by the Track Items service).
2. **Surface Delivery Statuses & Exceptions in the Wix Dashboard**:
   - Map Australia Post tracking statuses (`Created`, `Sealed`, `In transit`, `Awaiting collection`, `Delivered`, `Possible delay`, `Unsuccessful pickup`, `Returned to sender`) to visual status badges in the dashboard.
   - Add a **Delivery Exceptions** filter in the dashboard so merchants can immediately spot delayed, awaiting-collection, or returned parcels and proactively contact buyers.


### Phase 9: Wix Dashboard UI Architecture (Wix Design System)

Expand `src/app/dashboard/parts/ShippingRatesPageContent.tsx` from the reference tutorial into a 5-tab interface built with the [Wix Design System](https://www.wix-pages.com/wix-design-system/):

| Dashboard Tab | Key Wix Design System Components | Primary Merchant Actions |
| :--- | :--- | :--- |
| **1. Orders & Fulfillment** | `Table`, `TableToolbar`, `Search`, `Badge`, `Button`, `Modal`, `Checkbox` | View unfulfilled and fulfilled Wix orders; edit parcel dimensions/weights, authority-to-leave, transit cover, and customs forms; create single or bulk Australia Post shipments; generate and print labels; auto-fulfill in Wix. |
| **2. Shipments & Batch Labels** | `Table`, `StatusIndicator`, `Dropdown`, `Button`, `Loader`, `EmptyState` | Track shipment states (`Created`, `Label Ready`, `Manifested`); trigger bulk [Create Labels](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-labels) requests (`A4-1pp`, `A4-3pp`, `A6-1pp`); re-print existing PDF labels; void/delete unmanifested shipments. |
| **3. End-of-Day Manifests** | `Card`, `Table`, `MessageModalLayout`, `Button`, `TextButton` | Select all labeled shipments awaiting pickup; execute [Create Order From Shipments](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-order-from-shipments); download and print the signed PDF Order Summary via [Get Order Summary](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-order-summary); browse historical manifests and total GST-inclusive spend. |
| **4. Live Tracking & Exceptions** | `Table`, `Timeline`, `Badge`, `Tabs`, `Box` | View real-time scan history from [Track Items](https://developers.auspost.com.au/content/apis/shipping-and-tracking/reference-track-items.html); filter by `In Transit`, `Awaiting Collection`, `Delivered`, or `Exceptions`. |
| **5. Carrier, Boxes & Checkout Settings** | `Card`, `FormField`, `Input`, `Dropdown`, `ToggleSwitch`, `Collapse` | Enter and verify Australia Post API credentials via [Get Accounts](https://developers.auspost.com.au/apis/shipping-and-tracking/info/integration/workflows); validate sender suburb via [Validate Suburb](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/validate-suburb); manage custom boxes and prepaid satchels; toggle checkout services, handling markups, and fallback rates; view the `ActivationDetailsCard` instructions. |


### Phase 10: Testing, Australia Post Production Certification & Deployment

1. **Local & Dev Site Testing**:
   - Follow Step 5 and Step 6 of the [Wix Custom Shipping Rates Tutorial](https://dev.wix.com/docs/build-apps/get-started/tutorials/tutorial-create-a-self-hosted-custom-shipping-rates-app.md) to configure the **Ecom Shipping Rates** extension (`https://<your-app-domain>/api/shipping-rates`), the **Dashboard Page** extension (`https://<your-app-domain>/dashboard`), and the **Order Webhooks** (`https://<your-app-domain>/api/webhooks/v1/orders`).
   - Install the app on a Wix development store, enable the app under **Settings > Shipping, Delivery & Fulfillment**, and test:
     - Domestic checkout rating (Standard Address, Parcel Locker, and Parcel Collect).
     - International checkout rating (verifying single-item consignment consolidation).
     - Single-parcel and multi-parcel shipment creation, PDF label generation (`A4` and `A6`), and automatic Wix order fulfillment (`FULFILLED` status + tracking link in Wix).
     - Pre-manifest shipment deletion/voiding.
     - End-of-day Order creation and PDF Order Summary generation.
2. **Complete Mandatory Australia Post Production Certification**:
   - As required by the [Australia Post Shipping & Tracking FAQ](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/faq.html), before moving from the Australia Post Developer Test Bed to Production, generate and submit the following test artifacts to Australia Post Integration Support for validation:
     - A sample **PDF Shipping Label** generated via the Test Bed [Create Labels API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/create-labels).
     - A sample **PDF Order Summary Report (Manifest)** generated via the Test Bed [Get Order Summary API](https://developers.auspost.com.au/apis/shipping-and-tracking/reference/get-order-summary).
   - Once Australia Post approves the test artifacts and enables production access, switch the app's base URL from the Test Bed to Production (`https://digitalapi.auspost.com.au`) and deploy the Next.js application to production.
