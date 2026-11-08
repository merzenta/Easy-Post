import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

/**
 * Checks whether PostgreSQL DATABASE_URL is configured.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Validates that DATABASE_URL is present.
 * Throws a descriptive error if not set, enforcing database-only storage.
 */
export function assertDatabaseConfigured(): void {
  if (!isDatabaseConfigured()) {
    throw new Error(
      'DATABASE_URL environment variable is required. File-based .storage has been deprecated and removed. Please configure DATABASE_URL in your environment (.env or .env.local).',
    );
  }
}

/**
 * Returns a singleton instance of PrismaClient.
 * In development, prevents creating extra database connections across HMR reloads.
 */
export function getPrismaClient(): PrismaClient {
  assertDatabaseConfigured();

  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient({
      log: process.env.DEBUG_PRISMA ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return global.prismaGlobal;
}

/**
 * Proxy singleton for PrismaClient.
 * Defers client instantiation until property access so modules can safely load
 * while still enforcing DATABASE_URL validation upon query execution.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export default prisma;
