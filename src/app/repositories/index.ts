import {
  PrismaMerchantSettingsRepository,
  PrismaScanFormRepository,
  PrismaShipmentRepository,
  PrismaTrackingRepository,
} from './prisma-store';
import {
  IMerchantSettingsRepository,
  IScanFormRepository,
  IShipmentRepository,
  ITrackingRepository,
} from './interfaces';
import { assertDatabaseConfigured, isDatabaseConfigured } from '../utils/prisma';

export * from './interfaces';
export * from './prisma-store';
export { assertDatabaseConfigured, isDatabaseConfigured };

/**
 * Repository Factory Functions (Strict PostgreSQL Database Persistence)
 * If DATABASE_URL is not configured, these throw an explicit Error.
 */
export function createMerchantSettingsRepository(): IMerchantSettingsRepository {
  assertDatabaseConfigured();
  return new PrismaMerchantSettingsRepository();
}

export function createShipmentRepository(): IShipmentRepository {
  assertDatabaseConfigured();
  return new PrismaShipmentRepository();
}

export function createScanFormRepository(): IScanFormRepository {
  assertDatabaseConfigured();
  return new PrismaScanFormRepository();
}

export function createTrackingRepository(): ITrackingRepository {
  assertDatabaseConfigured();
  return new PrismaTrackingRepository();
}

// Default Singletons for application-wide consumption
export const merchantSettingsRepo: IMerchantSettingsRepository = new Proxy({} as IMerchantSettingsRepository, {
  get(_target, prop) {
    const repo = createMerchantSettingsRepository();
    const val = (repo as any)[prop];
    return typeof val === 'function' ? val.bind(repo) : val;
  },
});

export const shipmentRepo: IShipmentRepository = new Proxy({} as IShipmentRepository, {
  get(_target, prop) {
    const repo = createShipmentRepository();
    const val = (repo as any)[prop];
    return typeof val === 'function' ? val.bind(repo) : val;
  },
});

export const scanFormRepo: IScanFormRepository = new Proxy({} as IScanFormRepository, {
  get(_target, prop) {
    const repo = createScanFormRepository();
    const val = (repo as any)[prop];
    return typeof val === 'function' ? val.bind(repo) : val;
  },
});

export const trackingRepo: ITrackingRepository = new Proxy({} as ITrackingRepository, {
  get(_target, prop) {
    const repo = createTrackingRepository();
    const val = (repo as any)[prop];
    return typeof val === 'function' ? val.bind(repo) : val;
  },
});
