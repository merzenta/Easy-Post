# EasyPost x Wix Integration — Master Engineering Blueprint & Roadmap

This directory contains the technical specifications and engineering documentation for the **EasyPost Checkout Rating, Order Fulfillment, Label Generation, End-of-Day SCAN Form Manifesting, and Live Tracking Application** for Wix eCommerce.

---

## 1. Documentation Index

```
docs/plan/
├── README.md                                         # Master Navigation Index & Implementation Overview (This document)
├── 01_EASYPOST_ARCHITECTURE_AND_STORAGE_PLAN.md      # PostgreSQL Prisma ORM persistence, strict DATABASE_URL enforcement, AES-256 encryption
├── 02_SHIPPING_RATES_SPI_PLAN.md                     # Wix Checkout getShippingRates SPI, 3D cartonization, carrier matching, and caching
├── 03_LABEL_GENERATION_AND_ORDERS_WORKFLOW_PLAN.md   # Dynamic Orders Tab actions (Create Shipment -> Print Label / View Details), DB labelUrl persistence
├── 04_FULFILLMENT_SYNC_AND_TRACKING_PLAN.md          # Automated Wix Fulfillment sync, EasyPost Trackers, and delivery webhooks
└── 05_OBSERVABILITY_AND_TESTING_PLAN.md              # Persistent structured logging, rotation, JWS token verification, and test suites
```

---

## 2. Summary of Engineering Plans

| Plan Document | Primary Focus | Key Deliverables & Specifications |
| :--- | :--- | :--- |
| [**01. Architecture & Storage**](./01_EASYPOST_ARCHITECTURE_AND_STORAGE_PLAN.md) | Multi-Tenant Data Layer | Production PostgreSQL schema via Prisma ORM, strict `DATABASE_URL` requirement (no `.storage`), AES-256-GCM credential encryption. |
| [**02. Shipping Rates SPI**](./02_SHIPPING_RATES_SPI_PLAN.md) | Real-Time Checkout Rates | Wix Shipping Rates SPI integration, 3D box packing presets, state code normalization, carrier prefix matching (`USPS`, `FedExDefault`), 5-min TTL rate cache, fallback pricing. |
| [**03. Label Generation & Orders Workflow**](./03_LABEL_GENERATION_AND_ORDERS_WORKFLOW_PLAN.md) | Fulfillment & Document Access | Dynamic action button replacement in `OrdersTab` (`Create Shipment` $\to$ `Print Label` + `View Details`), permanent `label_url` storage in DB, dedicated `ShipmentDetailsModal`. |
| [**04. Fulfillment Sync & Tracking**](./04_FULFILLMENT_SYNC_AND_TRACKING_PLAN.md) | Lifecycle Automation | Automated sync with Wix eCommerce Order Fulfillment API (`orderFulfillments.createFulfillment`), EasyPost live tracking queries, and delivery status updates. |
| [**05. Observability & Testing**](./05_OBSERVABILITY_AND_TESTING_PLAN.md) | Reliability & QA | Enterprise JSON file logging (`spi-rates.log`, `requests.log`, `app-error.log`), Wix JWS signature decoding, carrier error unpacking, and 66+ unit tests passing. |

