# 05. Observability & Testing Plan

## 1. Structured Logging & Auditing

The application maintains persistent `.log` files in the `logs/` directory:

- `requests.log`: Records all incoming HTTP queries, automatically decoding Wix signed JWTs to human-readable JSON payloads.
- `spi-rates.log`: Audit trail for rate requests, logging `origin`, `destination`, calculated rates, cache hits, and fallback activations.
- `app-error.log`: Detailed error traces with carrier validation sub-errors unpacked from EasyPost exceptions.
- `app-combined.log`: General operational logging across background actions.

---

## 2. Test Architecture & Coverage

The test suite is built on Node's native test runner (`tsx --test tests/unit/*.test.ts`):

1. **`address-helper.test.ts`**: Verifies US state code normalization (`US-NJ` $\to$ `NJ`, `New Jersey` $\to$ `NJ`), international subdivisions, and recipient extraction from Wix orders.
2. **`box-packer.test.ts`**: Verifies 3D volume calculations and preset container packing.
3. **`crypto.test.ts`**: Verifies AES-256-GCM encryption, decryption, and tampering detection.
4. **`database-integration.test.ts`**: Verifies repository switching between multi-tenant file store and PostgreSQL Prisma models.
5. **`easypost-client.test.ts`**: Tests EasyPost client methods with credential validation.
6. **`shipment-lifecycle.test.ts`**: Tests shipment creation, label purchase, manifesting, and tracking persistence.
7. **`logger.test.ts`**: Tests structured logging and PII redaction.
