import test from 'node:test';
import assert from 'node:assert';
import { merchantSettingsRepo, shipmentRepo, scanFormRepo, trackingRepo } from '../../src/app/repositories/index';
import { prisma } from '../../src/app/utils/prisma';
import { EasyPostShipment } from '../../src/app/types/easypost.model';

test('PostgreSQL Database Repository Layer Tests', async (t) => {
  const TENANT_A = 'tenant-test-db-aaa-111';
  const TENANT_B = 'tenant-test-db-bbb-222';

  // Teardown / cleanup test records from Neon DB before and after
  async function cleanup() {
    try {
      await prisma.shipmentItem.deleteMany({
        where: { shipment: { instanceId: { in: [TENANT_A, TENANT_B] } } },
      });
      await prisma.shipment.deleteMany({
        where: { instanceId: { in: [TENANT_A, TENANT_B] } },
      });
      await prisma.scanFormOrder.deleteMany({
        where: { instanceId: { in: [TENANT_A, TENANT_B] } },
      });
      await prisma.trackingRecord.deleteMany({
        where: { instanceId: { in: [TENANT_A, TENANT_B] } },
      });
      await prisma.merchantSettings.deleteMany({
        where: { instanceId: { in: [TENANT_A, TENANT_B] } },
      });
    } catch {
      // Ignore cleanup errors
    }
  }

  await cleanup();
  t.after(async () => {
    await cleanup();
  });

  await t.test('MerchantSettingsRepository saves settings and encrypts secrets in database', async () => {
    const plainApiKey = 'EZTK_test_secret_key_123456';

    await merchantSettingsRepo.saveSettings(TENANT_A, {
      apiKey: plainApiKey,
      environment: 'TEST',
      fallbackRate: 12.5,
    });

    // 1. Retrieve through repository -> should be transparently decrypted
    const retrieved = await merchantSettingsRepo.getSettings(TENANT_A);
    assert.strictEqual(retrieved?.apiKey, plainApiKey);
    assert.strictEqual(retrieved?.fallbackRate, 12.5);

    // 2. Check physical row in database -> MUST be AES-256 encrypted
    const rawDbRecord = await prisma.merchantSettings.findUnique({
      where: { instanceId: TENANT_A },
    });
    assert.ok(rawDbRecord, 'Database record should exist in merchant_settings table');
    assert.notStrictEqual(rawDbRecord.apiKeyEncrypted, plainApiKey, 'DB column must not store plain text key');
    assert.strictEqual(
      rawDbRecord.apiKeyEncrypted.split(':').length,
      3,
      'DB column must store AES-256-GCM iv:tag:ciphertext payload',
    );

    // 3. hasConfiguredCredentials check
    const isConfigured = await merchantSettingsRepo.hasConfiguredCredentials(TENANT_A);
    assert.strictEqual(isConfigured, true);
  });

  await t.test('Multi-Tenant Isolation: Tenant A cannot see Tenant B settings or shipments', async () => {
    await merchantSettingsRepo.saveSettings(TENANT_B, {
      apiKey: 'EZAK_live_key_tenant_b_999',
      environment: 'PRODUCTION',
      fallbackRate: 20.0,
    });

    const settingsA = await merchantSettingsRepo.getSettings(TENANT_A);
    const settingsB = await merchantSettingsRepo.getSettings(TENANT_B);

    assert.strictEqual(settingsA?.apiKey, 'EZTK_test_secret_key_123456');
    assert.strictEqual(settingsB?.apiKey, 'EZAK_live_key_tenant_b_999');
    assert.strictEqual(settingsA?.fallbackRate, 12.5);
    assert.strictEqual(settingsB?.fallbackRate, 20.0);
  });

  await t.test('ShipmentRepository saves, queries, and filters unmanifested shipments in DB', async () => {
    const mockShipment: EasyPostShipment = {
      id: 'shipment-db-test-001',
      instance_id: TENANT_A,
      wix_order_id: 'wix-order-1001',
      easypost_shipment_id: 'shp_mock_ep_db_001',
      status: 'LABEL_PURCHASED',
      carrier: 'USPS',
      service: 'Priority',
      rate_amount: 8.5,
      rate_currency: 'USD',
      tracking_code: '9400100000000000000001',
      label_url: 'https://easypost-files.s3.amazonaws.com/label1.pdf',
      label_format: 'PDF',
      sender_address: {
        name: 'Sender Warehouse',
        street1: '100 Main St',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
        country: 'US',
      },
      recipient_address: {
        name: 'Jane Doe',
        street1: '20 High St',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001',
        country: 'US',
      },
      parcel: { length: 10, width: 8, height: 4, weight: 16 },
      items: [
        {
          id: 'item-1',
          item_id: 'prod-1',
          title: 'T-Shirt',
          quantity: 1,
          weight_oz: 16,
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await shipmentRepo.saveShipment(mockShipment);

    // Retrieve by ID
    const retrieved = await shipmentRepo.getShipmentById(TENANT_A, 'shipment-db-test-001');
    assert.strictEqual(retrieved?.easypost_shipment_id, 'shp_mock_ep_db_001');
    assert.strictEqual(retrieved?.tracking_code, '9400100000000000000001');

    // Retrieve unmanifested shipments
    const unmanifested = await shipmentRepo.getUnmanifestedShipments(TENANT_A);
    assert.strictEqual(unmanifested.length, 1);
    assert.strictEqual(unmanifested[0].id, 'shipment-db-test-001');

    // Ensure Tenant B cannot see Tenant A shipments
    const tenantBShipments = await shipmentRepo.listShipments(TENANT_B);
    assert.strictEqual(tenantBShipments.length, 0);
  });

  await t.test('ScanFormRepository saves and retrieves SCAN forms in DB', async () => {
    const scanForm = await scanFormRepo.saveScanForm({
      id: 'scan-db-test-001',
      instance_id: TENANT_A,
      easypost_scan_form_id: 'scan_mock_ep_db_999',
      status: 'created',
      form_url: 'https://easypost-files.s3.amazonaws.com/scan.pdf',
      form_file_type: 'PDF',
      shipment_count: 1,
      tracking_codes: ['9400100000000000000001'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    assert.strictEqual(scanForm.easypost_scan_form_id, 'scan_mock_ep_db_999');

    const retrieved = await scanFormRepo.getScanFormById(TENANT_A, 'scan_mock_ep_db_999');
    assert.strictEqual(retrieved?.id, 'scan-db-test-001');
    assert.strictEqual(retrieved?.form_url, 'https://easypost-files.s3.amazonaws.com/scan.pdf');
  });

  await t.test('TrackingRepository saves and queries tracking records in DB', async () => {
    const tracking = await trackingRepo.saveTrackingRecord({
      id: 'trk-db-test-001',
      instance_id: TENANT_A,
      tracking_code: '9400100000000000000001',
      carrier: 'USPS',
      status: 'in_transit',
      events: [{ datetime: '2026-11-02T10:00:00Z', message: 'Departed Facility', status: 'in_transit' }],
      is_delivered: false,
      has_exception: false,
      last_checked_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    assert.strictEqual(tracking.tracking_code, '9400100000000000000001');

    const retrieved = await trackingRepo.getTrackingRecord(TENANT_A, '9400100000000000000001');
    assert.strictEqual(retrieved?.status, 'in_transit');
    assert.strictEqual(retrieved?.events.length, 1);
  });
});
