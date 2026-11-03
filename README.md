# EasyPost x Wix Shipping Rates & Fulfillment App

An enterprise-ready, multi-tenant integration connecting **Wix eCommerce** stores with **EasyPost** multi-carrier logistics (`@easypost/api` v9.1.0).

---

## Key Capabilities

1. **Live Multi-Carrier Checkout Rates SPI**
   - Implements Wix Shipping Rates SPI at `/api/shipping-rates/v1/getRates`.
   - Real-time rating from USPS, FedEx, UPS, DHL Express, Canada Post, etc.
   - Deterministic 5-minute routing cache (`rate-cache.ts`) prevents duplicate API calls during buyer checkout.
   - Intelligent cartonization (`box-packer.ts`) packing order line items into optimal parcel presets or custom boxes.
   - Merchant-configurable handling markups (flat or percentage), free shipping thresholds, and fallback rates.

2. **Automated Postage Label Generation**
   - Buy labels directly with 1-click from the dashboard.
   - Outputs printable PDF, PNG, ZPL, or EPL2 formats.
   - Automatically synchronizes tracking number and carrier name back to Wix Order Fulfillments (`wixAppClient.orderFulfillments.createFulfillment`).

3. **End-of-Day SCAN Form Manifesting**
   - Groups all unmanifested shipments into an official EasyPost SCAN Form.
   - Generates single barcode document for carrier driver pickup.

4. **Live SmartTracking & Health Monitoring**
   - Instant tracking status, exceptions detection, and full event histories.
   - Production health check endpoint at `/api/health`.

5. **Multi-Tenant Pluggable Storage**
   - Zero-config local JSON store (`.storage/`) with AES-256-GCM credential encryption.
   - Production PostgreSQL via Prisma ORM (`prisma/schema.prisma`).

6. **Wix Design System 5-Tab Dashboard**
   - **Orders & Fulfillment**: View unfulfilled orders and prepare EasyPost shipments.
   - **Shipments & Labels**: Manage shipments, view carrier rates, buy postage labels.
   - **SCAN Forms / Manifests**: Dispatch queue and printable manifest sheets.
   - **Live Tracking**: Real-time carrier status with links to EasyPost SmartTracker.
   - **Carrier & API Settings**: EasyPost API key verification, warehouse address, and pricing rules.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests
```bash
npm test
```

### 3. Run Production Build
```bash
npm run build
```

### 4. Development Server
```bash
npm run dev
```

---

## Architecture Overview

```
├── prisma/
│   └── schema.prisma             # PostgreSQL multi-tenant schema
├── src/
│   ├── app/
│   │   ├── actions/              # Next.js Server Actions (shipments, labels, manifests, tracking)
│   │   ├── api/
│   │   │   ├── shipping-rates/   # Wix Shipping Rates SPI route
│   │   │   ├── labels/           # Label download & redirect
│   │   │   ├── manifests/        # SCAN form document redirect
│   │   │   └── health/           # Production status monitor
│   │   ├── client-hooks/         # React Query hooks for Wix Dashboard
│   │   ├── dashboard/            # Wix Design System 5-tab dashboard UI
│   │   ├── repositories/         # Multi-tenant storage (Prisma + Local Store)
│   │   ├── types/                # EasyPost & Wix domain models
│   │   └── utils/                # EasyPost SDK wrapper, box packer, logger, crypto
└── tests/unit/                   # Comprehensive unit test suite
```
