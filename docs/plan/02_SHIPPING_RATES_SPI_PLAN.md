# 02. Shipping Rates SPI & Cartonization Plan

## 1. Overview

The Wix eCommerce Shipping Rates SPI (`/api/shipping-rates/v1/getRates`) is invoked synchronously during buyer checkout. It calculates live carrier rates from EasyPost based on line items, weights, and destinations.

---

## 2. Core Execution Flow

```mermaid
sequenceDiagram
    participant Wix as Wix Checkout
    participant SPI as Rates SPI Route
    participant Packer as Box Packer
    participant Cache as Rate Cache (5-min TTL)
    participant EP as EasyPost API

    Wix->>SPI: POST /getRates (JWS body)
    SPI->>SPI: Validate JWS & Decode InstanceId
    SPI->>Packer: Pack Line Items into Presets
    Packer-->>SPI: Parcel (L x W x H, Weight Oz)
    SPI->>Cache: Lookup Rate Cache Key
    alt Cache Hit
        Cache-->>SPI: Cached Shipping Options
        SPI-->>Wix: Return Cached Rates (200 OK)
    else Cache Miss
        SPI->>EP: Create Shipment & Query Carrier Rates
        EP-->>SPI: Live Rates (USPS, FedEx, etc.)
        SPI->>SPI: Filter Allowed Carriers & Format Costs
        SPI->>Cache: Set Cached Rates
        SPI-->>Wix: Return Live Shipping Rates (200 OK)
    end
```

---

## 3. Key Enhancements

1. **State & Subdivision Normalization (`normalizeStateCode`)**:
   - Wix sends ISO 3166-2 subdivisions (e.g., `"US-NJ"`).
   - EasyPost and domestic US carriers require standard 2-letter uppercase codes (e.g., `"NJ"`).
   - Handled via `normalizeStateCode()` in `src/app/utils/address-helper.ts`.

2. **Carrier Prefix Matching**:
   - EasyPost returns sandbox FedEx rates under `"FedExDefault"`.
   - Rate filtering supports prefixes so that configuring `FEDEX` matches both `FEDEX` and `FedExDefault`.

3. **Cartonization & Box Packing**:
   - Normalizes items to ounces and inches.
   - Evaluates standard presets (`Small Box`, `Medium Box`, `Large Box`, `Flat Rate Envelope`).
   - Falls back to custom parcel dimensions when preset bounds are exceeded.

