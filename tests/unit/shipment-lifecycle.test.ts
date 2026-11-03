import test from 'node:test';
import assert from 'node:assert';
import {
  createShipmentForOrderAction,
  deleteShipmentAction,
  listShipmentsAction,
} from '../../src/app/actions/easypost-shipments';
import { buyShipmentLabelAction, getLabelUrlAction } from '../../src/app/actions/easypost-labels';
import { createScanFormManifestAction } from '../../src/app/actions/easypost-manifests';
import { trackShipmentAction } from '../../src/app/actions/easypost-tracking';
import { merchantSettingsRepo, shipmentRepo } from '../../src/app/repositories/index';
import { prisma } from '../../src/app/utils/prisma';
import { setEasyPostClientFactory } from '../../src/app/utils/easypost-client';

test('Order Fulfillment & EasyPost Shipment Lifecycle Unit Tests', async (t) => {
  const TEST_TENANT = 'tenant-test-easypost-lifecycle-001';

  async function cleanup() {
    try {
      await prisma.shipmentItem.deleteMany({
        where: { shipment: { instanceId: TEST_TENANT } },
      });
      await prisma.shipment.deleteMany({
        where: { instanceId: TEST_TENANT },
      });
      await prisma.scanFormOrder.deleteMany({
        where: { instanceId: TEST_TENANT },
      });
      await prisma.trackingRecord.deleteMany({
        where: { instanceId: TEST_TENANT },
      });
      await prisma.merchantSettings.deleteMany({
        where: { instanceId: TEST_TENANT },
      });
    } catch {
      // Ignore
    }
  }

  await cleanup();
  t.after(async () => {
    await cleanup();
  });

  // Configure merchant settings for the test tenant
  await merchantSettingsRepo.saveSettings(TEST_TENANT, {
    apiKey: 'EZTK_test_lifecycle_key',
    environment: 'TEST',
    merchantLocation: {
      name: 'Shipping Manager',
      company: 'Acme Dispatch',
      street1: '100 Warehouse Blvd',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
      phone: '4155551234',
    },
  });

  // Mock EasyPostService
  setEasyPostClientFactory(() => {
    return {
      getRates: async () => ({
        shipmentId: 'shp_mock_lifecycle_101',
        rates: [
          {
            id: 'rate_mock_1',
            carrier: 'USPS',
            service: 'Priority',
            rate: '7.85',
            currency: 'USD',
            delivery_days: 2,
          },
        ],
      }),
      buyShipment: async (shipmentId: string, rateId: string) => ({
        shipmentId,
        trackingCode: '9400199999999999999999',
        labelUrl: 'https://easypost-files.s3.amazonaws.com/label_101.pdf',
        rateId,
        rateAmount: 7.85,
        rateCurrency: 'USD',
        carrier: 'USPS',
        service: 'Priority',
      }),
      createScanForm: async () => ({
        id: 'scan_mock_lifecycle_202',
        status: 'created' as const,
        formUrl: 'https://easypost-files.s3.amazonaws.com/scan_202.pdf',
        trackingCodes: ['9400199999999999999999'],
      }),
      trackPackage: async (trackingCode: string) => ({
        tracking_code: trackingCode,
        status: 'in_transit' as const,
        events: [{ datetime: '2026-11-02T12:00:00Z', message: 'Accepted at USPS Facility', status: 'in_transit' }],
      }),
    } as any;
  });

  t.after(() => {
    setEasyPostClientFactory(null);
  });

  let createdShipmentId = '';

  await t.test('createShipmentForOrderAction creates and persists an EasyPost shipment', async () => {
    const created = await createShipmentForOrderAction(
      {
        orderId: 'wix-order-5001',
        orderNumber: '5001',
        recipient: {
          name: 'Sarah Connor',
          street1: '12 Tech Lane',
          city: 'Los Angeles',
          state: 'CA',
          zip: '90001',
          country: 'US',
          phone: '3105551234',
        },
        parcel: {
          length: 10,
          width: 8,
          height: 4,
          weight: 16,
        },
        items: [
          {
            id: 'item-1',
            item_id: 'line-1',
            title: 'Laser Unit',
            quantity: 1,
            weight_oz: 16,
          },
        ],
      },
      { instanceId: TEST_TENANT },
    );

    assert.strictEqual(created.easypost_shipment_id, 'shp_mock_lifecycle_101');
    assert.strictEqual(created.status, 'CREATED');
    assert.strictEqual(created.rates?.length, 1);
    assert.strictEqual(created.carrier, 'USPS');
    createdShipmentId = created.id;

    // Verify stored
    const stored = await shipmentRepo.getShipmentById(TEST_TENANT, createdShipmentId);
    assert.strictEqual(stored?.id, createdShipmentId);
  });

  await t.test('buyShipmentLabelAction purchases postage and transitions status to LABEL_PURCHASED', async () => {
    const bought = await buyShipmentLabelAction(createdShipmentId, 'rate_mock_1', { instanceId: TEST_TENANT });

    assert.strictEqual(bought.status, 'LABEL_PURCHASED');
    assert.strictEqual(bought.tracking_code, '9400199999999999999999');
    assert.strictEqual(bought.label_url, 'https://easypost-files.s3.amazonaws.com/label_101.pdf');

    const labelUrl = await getLabelUrlAction(createdShipmentId, { instanceId: TEST_TENANT });
    assert.strictEqual(labelUrl.labelUrl, 'https://easypost-files.s3.amazonaws.com/label_101.pdf');
  });

  await t.test('createScanFormManifestAction aggregates labeled shipment into a SCAN Form', async () => {
    const scanForm = await createScanFormManifestAction([createdShipmentId], { instanceId: TEST_TENANT });

    assert.strictEqual(scanForm.easypost_scan_form_id, 'scan_mock_lifecycle_202');
    assert.strictEqual(scanForm.status, 'created');
    assert.strictEqual(scanForm.form_url, 'https://easypost-files.s3.amazonaws.com/scan_202.pdf');

    const updatedShipment = await shipmentRepo.getShipmentById(TEST_TENANT, createdShipmentId);
    assert.strictEqual(updatedShipment?.status, 'MANIFESTED');
    assert.strictEqual(updatedShipment?.scan_form_id, 'scan_mock_lifecycle_202');
  });

  await t.test('trackShipmentAction updates live tracking events', async () => {
    const tracking = await trackShipmentAction('9400199999999999999999', 'USPS', { instanceId: TEST_TENANT });

    assert.strictEqual(tracking.tracking_code, '9400199999999999999999');
    assert.strictEqual(tracking.status, 'in_transit');
    assert.strictEqual(tracking.events.length, 1);
  });

  await t.test('deleteShipmentAction deletes an unmanifested shipment', async () => {
    const deleted = await deleteShipmentAction(createdShipmentId, { instanceId: TEST_TENANT });
    assert.strictEqual(deleted, true);

    const remaining = await listShipmentsAction({ instanceId: TEST_TENANT });
    assert.strictEqual(remaining.length, 0);
  });
});
