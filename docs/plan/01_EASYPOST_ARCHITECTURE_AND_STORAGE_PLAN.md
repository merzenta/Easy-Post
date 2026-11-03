# 01. EasyPost Architecture & Storage Plan

## 1. Architectural Overview

The application utilizes a production PostgreSQL Database persistence engine powered by Prisma ORM:

1. **Production Relational Database (`prisma-store.ts`)**:
   - PostgreSQL support via Prisma ORM for high concurrency (Neon, Supabase, AWS RDS Aurora).
   - Strict `DATABASE_URL` enforcement in `src/app/utils/prisma.ts` and `src/app/repositories/index.ts`. If `DATABASE_URL` is omitted, the app throws a descriptive error immediately.
   - File-based `.storage/` has been deprecated and removed.
2. **Security & Encryption (`crypto.ts`)**:
   - AES-256-GCM authenticated encryption for all merchant credentials and secrets stored in PostgreSQL.

---

## 2. Relational Schema (`prisma/schema.prisma`)

```prisma
model MerchantSettings {
  id                    String   @id @default(uuid())
  instanceId            String   @unique @map("instance_id")
  environment           String   @default("TEST") // TEST | PRODUCTION
  apiKeyEncrypted       String   @map("api_key_encrypted")
  webhookSecret         String?  @map("webhook_secret")
  defaultLabelFormat    String   @default("PDF") @map("default_label_format")
  merchantLocation      Json     @map("merchant_location")
  packagePresets        Json     @default("[]") @map("package_presets")
  enabledCarriers       Json     @default("[\"USPS\", \"FedEx\", \"UPS\", \"DHL\"]") @map("enabled_carriers")
  carrierAccounts       Json     @default("[]") @map("carrier_accounts")
  handlingFeeType       String   @default("NONE") @map("handling_fee_type")
  handlingFeeValue      Float    @default(0.0) @map("handling_fee_value")
  fallbackRate          Float    @default(10.0) @map("fallback_rate")
  defaultItemWeightOz   Float    @default(16.0) @map("default_item_weight_oz")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  @@index([instanceId])
  @@map("merchant_settings")
}

model Shipment {
  id                 String          @id @default(uuid())
  instanceId         String          @map("instance_id")
  wixOrderId         String          @map("wix_order_id")
  easypostShipmentId String          @unique @map("easypost_shipment_id")
  status             String          @default("CREATED") // CREATED, LABEL_PURCHASED, MANIFESTED
  carrier            String          @map("carrier")
  service            String          @map("service")
  rateId             String?         @map("rate_id")
  rateAmount         Float           @default(0.0) @map("rate_amount")
  rateCurrency       String          @default("USD") @map("rate_currency")
  trackingCode       String?         @map("tracking_code")
  trackerId          String?         @map("tracker_id")
  wixFulfillmentId   String?         @map("wix_fulfillment_id")

  senderAddress      Json            @map("sender_address")
  recipientAddress   Json            @map("recipient_address")
  parcelData         Json            @map("parcel_data")
  ratesData          Json?           @map("rates_data")

  labelUrl           String?         @map("label_url")
  labelFormat        String          @default("PDF") @map("label_format")
  scanFormId         String?         @map("scan_form_id")

  items              ShipmentItem[]
  createdAt          DateTime        @default(now()) @map("created_at")
  updatedAt          DateTime        @updatedAt @map("updated_at")

  @@index([instanceId, status])
  @@index([instanceId, wixOrderId])
  @@map("shipments")
}
```

---

## 3. Credential Encryption Engine (`crypto.ts`)

- **Algorithm**: `aes-256-gcm`
- **IV Size**: 12 bytes (96 bits) randomly generated per encryption operation.
- **Master Key Derivation**: SHA-256 hash of `APP_ENCRYPTION_KEY`.
- **Payload Format**: `ivHex:authTagHex:ciphertextHex`
- **Tampering Detection**: Any alteration to the ciphertext or auth tag throws an authentication error during decryption.
