# 04. Fulfillment Sync & Tracking Plan

## 1. Overview

Once a shipping label is purchased, the app automatically transitions the Wix order from `UNFULFILLED` to `FULFILLED` using the Wix eCommerce Order Fulfillments API, and enables real-time parcel tracking.

---

## 2. Automated Wix Fulfillment Sync

When `buyShipmentLabelAction` succeeds:
1. Calls `syncOrderFulfillmentAction`:
   - Passes `orderId`, `trackingCode`, and `carrierName`.
   - Invokes `@wix/ecom_order-fulfillments` API:
     ```typescript
     await sdk.orderFulfillments.createFulfillment({
       orderId,
       fulfillment: {
         lineItems: items.map((it) => ({ id: it.id, quantity: it.quantity })),
         trackingInfo: {
           trackingNumber: trackingCode,
           shippingProvider: carrier,
         },
       },
     });
     ```
2. Stores `wixFulfillmentId` on the shipment record.

---

## 3. EasyPost Tracker & Webhooks

- EasyPost automatically creates a Tracker when a shipment is purchased.
- The tracking code and public URL (`tracker.public_url`) are stored on the shipment.
- Delivery webhook events (`tracker.updated`) can update shipment status to `IN_TRANSIT` or `DELIVERED`.

