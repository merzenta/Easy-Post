import test from 'node:test';
import assert from 'node:assert';
import {
  trackShipmentAction,
  getTrackingRecordAction,
  listTrackingRecordsAction,
} from '../../src/app/actions/easypost-tracking';
import { GET as healthCheckGet } from '../../src/app/api/health/route';
import { merchantSettingsRepo, trackingRepo } from '../../src/app/repositories/index';
import { prisma } from '../../src/app/utils/prisma';
import { setEasyPostClientFactory } from '../../src/app/utils/easypost-client';

test('EasyPost Live Tracking & Production Health Check Unit Tests', async (t) => {
  const TEST_TENANT = 'tenant-test-easypost-tracking-health-001';

  async function cleanup() {
    try {
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

  await merchantSettingsRepo.saveSettings(TEST_TENANT, {
    apiKey: 'EZTK_mock_key_health',
    environment: 'TEST',
  });

  setEasyPostClientFactory(() => {
    return {
      trackPackage: async (trackingCode: string, carrier?: string) => ({
        tracking_code: trackingCode,
        carrier: carrier || 'USPS',
        status: 'delivered' as const,
        is_delivered: true,
        has_exception: false,
        events: [
          {
            datetime: '2026-11-02T14:30:00Z',
            message: 'Delivered - Front Door',
            status: 'delivered',
            location: 'San Francisco, CA US',
          },
        ],
      }),
    } as any;
  });

  t.after(() => {
    setEasyPostClientFactory(null);
  });

  await t.test('trackShipmentAction queries EasyPost tracker, parses delivery state, and saves records', async () => {
    const tracking = await trackShipmentAction('9400111122223333444455', 'USPS', {
      instanceId: TEST_TENANT,
    });

    assert.strictEqual(tracking.tracking_code, '9400111122223333444455');
    assert.strictEqual(tracking.carrier, 'USPS');
    assert.strictEqual(tracking.status, 'delivered');
    assert.strictEqual(tracking.is_delivered, true);
    assert.strictEqual(tracking.has_exception, false);
    assert.strictEqual(tracking.events.length, 1);

    // Verify stored
    const stored = await getTrackingRecordAction('9400111122223333444455', {
      instanceId: TEST_TENANT,
    });
    assert.strictEqual(stored?.status, 'delivered');

    // List records
    const all = await listTrackingRecordsAction({ instanceId: TEST_TENANT });
    assert.strictEqual(all.length, 1);
  });

  await t.test('Health check endpoint returns 200 OK with healthy status and metadata', async () => {
    const res = await healthCheckGet();
    assert.strictEqual(res.status, 200);

    const body = await res.json();
    assert.strictEqual(body.status, 'healthy');
    assert.strictEqual(body.name, 'wix-easypost-integration');
    assert.strictEqual(body.checks.database.healthy, true);
    assert.strictEqual(body.checks.database.provider, 'postgresql');
    assert.strictEqual(body.checks.easypostApi.endpoint, 'https://api.easypost.com/v2');
  });
});
