import test from 'node:test';
import assert from 'node:assert';
import {
  matchRateWithCheckoutChoice,
  extractOrderShippingChoice,
  formatCarrierService,
} from '../../src/app/utils/rate-matcher';
import { EasyPostRate } from '../../src/app/types/easypost.model';

test('Rate Matcher Unit Tests', async (t) => {
  const sampleRates: EasyPostRate[] = [
    {
      id: 'rate_priority_123',
      carrier: 'USPS',
      service: 'Priority',
      rate: '13.87',
      currency: 'USD',
      delivery_days: 2,
    },
    {
      id: 'rate_ground_456',
      carrier: 'USPS',
      service: 'GroundAdvantage',
      rate: '7.95',
      currency: 'USD',
      delivery_days: 4,
    },
    {
      id: 'rate_express_789',
      carrier: 'USPS',
      service: 'Express',
      rate: '54.41',
      currency: 'USD',
      delivery_days: 1,
    },
    {
      id: 'rate_fedex_2day',
      carrier: 'FedEx',
      service: '2Day',
      rate: '27.72',
      currency: 'USD',
      delivery_days: 2,
    },
    {
      id: 'rate_ups_ground',
      carrier: 'UPS',
      service: 'Ground',
      rate: '18.92',
      currency: 'USD',
      delivery_days: 3,
    },
  ];

  await t.test('matches exact EasyPost rate ID from checkout code', () => {
    const result = matchRateWithCheckoutChoice(sampleRates, {
      code: 'easypost-rate_ground_456',
      title: 'USPS — GroundAdvantage',
    });

    assert.ok(result);
    assert.strictEqual(result.matchType, 'EXACT_ID');
    assert.strictEqual(result.matchedRate.id, 'rate_ground_456');
    assert.strictEqual(result.matchedRate.service, 'GroundAdvantage');
    assert.strictEqual(result.matchedRate.rate, '7.95');
  });

  await t.test('matches carrier and service title format from checkout', () => {
    // When customer selects USPS GroundAdvantage ($7.95)
    const resultGround = matchRateWithCheckoutChoice(sampleRates, {
      title: 'USPS — GroundAdvantage',
    });
    assert.ok(resultGround);
    assert.strictEqual(resultGround.matchedRate.id, 'rate_ground_456');
    assert.strictEqual(resultGround.matchedRate.service, 'GroundAdvantage');

    // When customer selects FedEx 2Day ($27.72)
    const resultFedEx = matchRateWithCheckoutChoice(sampleRates, {
      title: 'FedEx — 2Day',
    });
    assert.ok(resultFedEx);
    assert.strictEqual(resultFedEx.matchedRate.id, 'rate_fedex_2day');
    assert.strictEqual(resultFedEx.matchedRate.rate, '27.72');

    // When customer selects USPS Priority ($13.87)
    const resultPriority = matchRateWithCheckoutChoice(sampleRates, {
      title: 'USPS — Priority',
    });
    assert.ok(resultPriority);
    assert.strictEqual(resultPriority.matchedRate.id, 'rate_priority_123');
    assert.strictEqual(resultPriority.matchedRate.rate, '13.87');
  });

  await t.test('matches space-separated service variations (Ground Advantage)', () => {
    const result = matchRateWithCheckoutChoice(sampleRates, {
      title: 'USPS Ground Advantage',
    });
    assert.ok(result);
    assert.strictEqual(result.matchedRate.id, 'rate_ground_456');
  });

  await t.test('matches by exact price when title is generic', () => {
    const result = matchRateWithCheckoutChoice(sampleRates, {
      title: 'Selected Delivery',
      cost: { price: '27.72', currency: 'USD' },
    });
    assert.ok(result);
    assert.strictEqual(result.matchedRate.id, 'rate_fedex_2day');
  });

  await t.test('falls back to lowest rate when no match found', () => {
    const result = matchRateWithCheckoutChoice(sampleRates, {
      title: 'Unknown Custom Courier',
    });
    assert.ok(result);
    assert.strictEqual(result.matchType, 'FALLBACK_LOWEST');
    assert.strictEqual(result.matchedRate.rate, '7.95'); // Lowest is GroundAdvantage
  });

  await t.test('extractOrderShippingChoice extracts shipping info properly', () => {
    const mockOrder = {
      shippingInfo: {
        code: 'easypost-rate_ground_456',
        title: 'USPS — GroundAdvantage',
        cost: { price: '7.95', currency: 'USD' },
        logistics: { deliveryTime: '3-5 business days' },
      },
      priceSummary: {
        shipping: { amount: '7.95' },
      },
    };

    const extracted = extractOrderShippingChoice(mockOrder);
    assert.strictEqual(extracted.code, 'easypost-rate_ground_456');
    assert.strictEqual(extracted.title, 'USPS — GroundAdvantage');
    assert.strictEqual(extracted.cost?.price, '7.95');
    assert.strictEqual(extracted.deliveryTime, '3-5 business days');
  });

  await t.test('formatCarrierService formats carrier and service names with proper spacing', () => {
    assert.strictEqual(formatCarrierService('USPS', 'GroundAdvantage'), 'USPS — Ground Advantage');
    assert.strictEqual(formatCarrierService('USPS', 'PriorityMailInternational'), 'USPS — Priority Mail International');
    assert.strictEqual(
      formatCarrierService('USPS', 'FirstClassPackageInternationalService'),
      'USPS — First Class Package International',
    );
    assert.strictEqual(formatCarrierService('FedExDefault', 'FEDEX_2_DAY'), 'FedEx — 2 Day');
    assert.strictEqual(formatCarrierService('FedExDefault', 'FEDEX_GROUND'), 'FedEx — Ground');
    assert.strictEqual(formatCarrierService('USPS', 'Express'), 'USPS — Priority Mail Express');
  });
});
