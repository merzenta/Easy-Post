import test from 'node:test';
import assert from 'node:assert';
import {
  isDatabaseConfigured,
  assertDatabaseConfigured,
  createMerchantSettingsRepository,
  createShipmentRepository,
  createScanFormRepository,
  createTrackingRepository,
  PrismaMerchantSettingsRepository,
  PrismaShipmentRepository,
  PrismaScanFormRepository,
  PrismaTrackingRepository,
} from '../../src/app/repositories/index';
import { encryptCredential } from '../../src/app/utils/crypto';
import { EasyPostShipment } from '../../src/app/types/easypost.model';

test('Database Persistence Architecture & Factory Enforcement', async (t) => {
  const origDbUrl = process.env.DATABASE_URL;

  await t.test('throws descriptive error when DATABASE_URL is not configured', () => {
    delete process.env.DATABASE_URL;
    assert.strictEqual(isDatabaseConfigured(), false);

    assert.throws(() => createMerchantSettingsRepository(), /DATABASE_URL environment variable is required/);
    assert.throws(() => createShipmentRepository(), /DATABASE_URL environment variable is required/);
    assert.throws(() => assertDatabaseConfigured(), /DATABASE_URL environment variable is required/);
  });

  await t.test('detects when DATABASE_URL is set and instantiates Prisma repositories', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:secret@localhost:5432/easypost_wix?schema=public';
    assert.strictEqual(isDatabaseConfigured(), true);

    const settingsRepo = createMerchantSettingsRepository();
    const shipmentRepo = createShipmentRepository();

    assert.ok(settingsRepo instanceof PrismaMerchantSettingsRepository);
    assert.ok(shipmentRepo instanceof PrismaShipmentRepository);

    // Restore environment
    if (origDbUrl !== undefined) {
      process.env.DATABASE_URL = origDbUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });
});

test('PrismaMerchantSettingsRepository with Mocked Client', async (t) => {
  const mockDb: Record<string, any> = {};

  const mockPrisma: any = {
    merchantSettings: {
      findUnique: async ({ where }: any) => {
        return mockDb[where.instanceId] || null;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = mockDb[where.instanceId];
        const record = {
          id: existing?.id || 'uuid-1',
          createdAt: existing?.createdAt || new Date(),
          updatedAt: new Date(),
          ...(existing ? { ...existing, ...update } : create),
        };
        mockDb[where.instanceId] = record;
        return record;
      },
    },
  };

  const repo = new PrismaMerchantSettingsRepository(mockPrisma);
  const INSTANCE = 'tenant-prisma-mock-inst-01';

  await t.test('saves and retrieves merchant settings', async () => {
    const saved = await repo.saveSettings(INSTANCE, {
      apiKey: 'EZTK_secret_prisma_mock_key',
      environment: 'TEST',
      fallbackRate: 14.5,
    });

    assert.strictEqual(saved.apiKey, 'EZTK_secret_prisma_mock_key');
    assert.strictEqual(saved.fallbackRate, 14.5);

    // Ensure encrypted in mockDb
    const rawDbRecord = mockDb[INSTANCE];
    assert.notStrictEqual(rawDbRecord.apiKeyEncrypted, 'EZTK_secret_prisma_mock_key');

    // Retrieve through repo
    const retrieved = await repo.getSettings(INSTANCE);
    assert.strictEqual(retrieved?.apiKey, 'EZTK_secret_prisma_mock_key');
    assert.strictEqual(retrieved?.fallbackRate, 14.5);
  });
});

test('PrismaShipmentRepository with Mocked Client', async (t) => {
  const mockDb: Record<string, any> = {};

  const mockPrisma: any = {
    shipment: {
      findFirst: async ({ where }: any) => {
        return (
          Object.values(mockDb).find((s: any) => {
            if (where.instanceId && s.instanceId !== where.instanceId) return false;
            if (where.id && s.id !== where.id) return false;
            if (where.easypostShipmentId && s.easypostShipmentId !== where.easypostShipmentId) return false;
            return true;
          }) || null
        );
      },
      findMany: async ({ where }: any) => {
        return Object.values(mockDb).filter((s: any) => {
          if (where.instanceId && s.instanceId !== where.instanceId) return false;
          if (where.status && s.status !== where.status) return false;
          return true;
        });
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = mockDb[where.easypostShipmentId];
        const record = {
          id: existing?.id || create.id || 'uuid-shp',
          createdAt: existing?.createdAt || new Date(),
          updatedAt: new Date(),
          ...(existing ? { ...existing, ...update } : create),
        };
        mockDb[where.easypostShipmentId] = record;
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = Object.values(mockDb).find((s: any) => s.id === where.id);
        if (!existing) throw new Error('Not found');
        const updated = { ...existing, ...data, updatedAt: new Date() };
        mockDb[existing.easypostShipmentId] = updated;
        return updated;
      },
      deleteMany: async ({ where }: any) => {
        const keysToDelete = Object.keys(mockDb).filter((k) => mockDb[k].id === where.id);
        keysToDelete.forEach((k) => delete mockDb[k]);
        return { count: keysToDelete.length };
      },
    },
  };

  const repo = new PrismaShipmentRepository(mockPrisma);
  const INSTANCE = 'tenant-prisma-shipment-01';

  await t.test('saves, retrieves, updates status, and deletes shipment', async () => {
    const shipment: EasyPostShipment = {
      id: 'shp-prisma-001',
      instance_id: INSTANCE,
      wix_order_id: 'order-101',
      easypost_shipment_id: 'shp_mock_ep_999',
      status: 'CREATED',
      carrier: 'USPS',
      service: 'Priority',
      rate_amount: 9.25,
      rate_currency: 'USD',
      label_format: 'PDF',
      sender_address: { street1: '100 Main St', city: 'SF', state: 'CA', zip: '94105', country: 'US' },
      recipient_address: { street1: '200 High St', city: 'LA', state: 'CA', zip: '90001', country: 'US' },
      parcel: { length: 10, width: 8, height: 4, weight: 16 },
      items: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const saved = await repo.saveShipment(shipment);
    assert.strictEqual(saved.easypost_shipment_id, 'shp_mock_ep_999');

    const retrieved = await repo.getShipmentById(INSTANCE, 'shp-prisma-001');
    assert.strictEqual(retrieved?.id, 'shp-prisma-001');

    const updated = await repo.updateShipmentStatus(INSTANCE, 'shp-prisma-001', 'LABEL_PURCHASED', {
      tracking_code: '9400123456789',
    });
    assert.strictEqual(updated?.status, 'LABEL_PURCHASED');
    assert.strictEqual(updated?.tracking_code, '9400123456789');

    const deleted = await repo.deleteShipment(INSTANCE, 'shp-prisma-001');
    assert.strictEqual(deleted, true);

    const afterDelete = await repo.getShipmentById(INSTANCE, 'shp-prisma-001');
    assert.strictEqual(afterDelete, null);
  });
});
