import crypto from 'crypto';

interface CachedRateEntry<T> {
  data: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes (300 seconds)
const rateCacheStore = new Map<string, CachedRateEntry<unknown>>();

/**
 * Generates a deterministic cache key from the tenant ID and cart routing parameters
 */
export function generateRateCacheKey(
  instanceId: string,
  destination: { country?: string | null; zip?: string | null; state?: string | null; city?: string | null },
  parcel: { length: number; width: number; height: number; weight: number },
): string {
  const payload = JSON.stringify({
    instanceId,
    country: (destination.country || 'US').toUpperCase(),
    zip: (destination.zip || '').trim(),
    state: (destination.state || '').trim().toUpperCase(),
    city: (destination.city || '').trim().toUpperCase(),
    parcel: {
      l: parcel.length,
      w: parcel.width,
      h: parcel.height,
      wt: parcel.weight,
    },
  });

  return crypto.createHash('md5').update(payload).digest('hex');
}

export function getCachedRates<T>(cacheKey: string): T | null {
  const entry = rateCacheStore.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    rateCacheStore.delete(cacheKey);
    return null;
  }

  return entry.data as T;
}

export function setCachedRates<T>(cacheKey: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  // Simple eviction if cache exceeds 1000 entries
  if (rateCacheStore.size > 1000) {
    const oldestKey = rateCacheStore.keys().next().value;
    if (oldestKey) {
      rateCacheStore.delete(oldestKey);
    }
  }

  rateCacheStore.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearRateCache(): void {
  rateCacheStore.clear();
}
