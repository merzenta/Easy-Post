import test from 'node:test';
import assert from 'node:assert';
import { normalizeDimensionToInches, normalizeWeightToOz, packItemsForEasyPost } from '../../src/app/utils/box-packer';
import { generateRateCacheKey, getCachedRates, setCachedRates, clearRateCache } from '../../src/app/utils/rate-cache';

test('EasyPost Cartonization & Box Packer Unit Tests', async (t) => {
  await t.test('Weight and Dimension normalization to Oz and Inches', () => {
    // Weights (to Oz)
    assert.strictEqual(normalizeWeightToOz(16, 'OZ'), 16);
    assert.strictEqual(normalizeWeightToOz(1, 'LB'), 16);
    assert.strictEqual(Math.round(normalizeWeightToOz(1, 'KG') * 100) / 100, 35.27);
    assert.strictEqual(Math.round(normalizeWeightToOz(100, 'G') * 100) / 100, 3.53);

    // Dimensions (to Inches)
    assert.strictEqual(normalizeDimensionToInches(10, 'IN'), 10);
    assert.strictEqual(Math.round(normalizeDimensionToInches(25.4, 'CM') * 10) / 10, 10);
    assert.strictEqual(Math.round(normalizeDimensionToInches(254, 'MM') * 10) / 10, 10);
    assert.strictEqual(Math.round(normalizeDimensionToInches(1, 'M') * 10) / 10, 39.4);
  });

  await t.test('Packs small items into Small Box preset when volume and weight fit', () => {
    const result = packItemsForEasyPost(
      [
        {
          quantity: 1,
          physicalProperties: {
            weight: 8, // 8 oz
            dimensions: { length: 5, width: 4, height: 2 },
          },
        },
      ],
      { weightUnit: 'OZ', dimensionUnit: 'IN' },
    );

    assert.strictEqual(result.parcel.length, 6);
    assert.strictEqual(result.parcel.width, 6);
    assert.strictEqual(result.parcel.height, 4);
    assert.strictEqual(result.parcel.predefinedPackage, 'SmallFlatRateBox');
    assert.strictEqual(result.totalWeightOz, 8);
  });

  await t.test('Packs larger items into Medium Box preset when small box is exceeded', () => {
    const result = packItemsForEasyPost(
      [
        {
          quantity: 2,
          physicalProperties: {
            weight: 12, // 2 * 12 = 24 oz
            dimensions: { length: 8, width: 6, height: 3 },
          },
        },
      ],
      { weightUnit: 'OZ', dimensionUnit: 'IN' },
    );

    assert.strictEqual(result.parcel.predefinedPackage, 'MediumFlatRateBox');
    assert.strictEqual(result.totalWeightOz, 24);
  });

  await t.test('Falls back to Custom Parcel for items exceeding standard presets', () => {
    const result = packItemsForEasyPost(
      [
        {
          quantity: 1,
          physicalProperties: {
            weight: 700, // 700 oz exceeds large box 640 oz
            dimensions: { length: 20, width: 15, height: 12 },
          },
        },
      ],
      { weightUnit: 'OZ', dimensionUnit: 'IN' },
    );

    assert.strictEqual(result.parcel.packagingType, 'Custom Parcel');
    assert.ok(result.parcel.length >= 20);
    assert.ok(result.parcel.width >= 15);
    assert.ok(result.parcel.height >= 12);
  });

  await t.test('Rate Cache caches rates and returns hits', () => {
    clearRateCache();
    const destination = { country: 'US', zip: '94105', state: 'CA', city: 'San Francisco' };
    const parcel = { length: 11, width: 8.5, height: 5.5, weight: 16 };

    const cacheKey = generateRateCacheKey('test-instance', destination, parcel);
    assert.strictEqual(getCachedRates(cacheKey), null);

    const mockRates = [{ code: 'easypost-usps', title: 'USPS Priority', cost: { price: '8.50', currency: 'USD' } }];

    setCachedRates(cacheKey, mockRates, 1000);
    const cached = getCachedRates(cacheKey);
    assert.deepStrictEqual(cached, mockRates);
  });
});
