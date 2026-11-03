import test from 'node:test';
import assert from 'node:assert';
import { EasyPostService, createEasyPostClient } from '../../src/app/utils/easypost-client';

test('EasyPost Client SDK Service Tests', async (t) => {
  await t.test('throws error if API key is not provided', () => {
    assert.throws(() => {
      new EasyPostService('');
    }, /EasyPost API key must be provided/);
  });

  await t.test('creates client instance with valid key', () => {
    const service = createEasyPostClient('test_api_key_123');
    assert.ok(service instanceof EasyPostService);
  });

  await t.test('getRates formats payload and creates shipment with carrier rates', async () => {
    const service = createEasyPostClient('dummy_key');

    // Mock client.Shipment.create
    (service as any).client = {
      Shipment: {
        create: async (params: any) => {
          assert.strictEqual(params.to_address.zip, '90210');
          assert.strictEqual(params.from_address.zip, '94105');
          assert.strictEqual(params.parcel.weight, 16);
          return {
            id: 'shp_mock_123',
            rates: [
              {
                id: 'rate_mock_1',
                carrier: 'USPS',
                service: 'Priority',
                rate: '8.50',
                currency: 'USD',
                delivery_days: 2,
              },
              {
                id: 'rate_mock_2',
                carrier: 'FedEx',
                service: 'Ground',
                rate: '11.20',
                currency: 'USD',
                delivery_days: 3,
              },
            ],
          };
        },
      },
    };

    const res = await service.getRates({
      fromAddress: { street1: '100 Main St', city: 'San Francisco', state: 'CA', zip: '94105', country: 'US' },
      toAddress: { street1: '200 Ocean Ave', city: 'Beverly Hills', state: 'CA', zip: '90210', country: 'US' },
      parcel: { length: 10, width: 8, height: 4, weight: 16 },
    });

    assert.strictEqual(res.shipmentId, 'shp_mock_123');
    assert.strictEqual(res.rates.length, 2);
    assert.strictEqual(res.rates[0].carrier, 'USPS');
    assert.strictEqual(res.rates[0].rate, '8.50');
    assert.strictEqual(res.rates[0].delivery_days, 2);
  });

  await t.test('buyShipment calls Shipment.buy and returns tracking & label URL', async () => {
    const service = createEasyPostClient('dummy_key');

    (service as any).client = {
      Shipment: {
        buy: async (shipmentId: string, rateId: string) => {
          assert.strictEqual(shipmentId, 'shp_123');
          assert.strictEqual(rateId, 'rate_456');
          return {
            id: 'shp_123',
            tracking_code: '9400100000000000000000',
            postage_label: {
              label_url: 'https://easypost-files.s3.amazonaws.com/label.pdf',
            },
            tracker: {
              id: 'trk_789',
              public_url: 'https://track.easypost.com/9400100000000000000000',
            },
            selected_rate: {
              id: 'rate_456',
              carrier: 'USPS',
              service: 'Priority',
              rate: '8.50',
              currency: 'USD',
            },
          };
        },
      },
    };

    const res = await service.buyShipment('shp_123', 'rate_456');
    assert.strictEqual(res.shipmentId, 'shp_123');
    assert.strictEqual(res.trackingCode, '9400100000000000000000');
    assert.strictEqual(res.labelUrl, 'https://easypost-files.s3.amazonaws.com/label.pdf');
    assert.strictEqual(res.carrier, 'USPS');
    assert.strictEqual(res.rateAmount, 8.5);
  });

  await t.test('createScanForm submits shipment IDs and returns manifest barcode doc', async () => {
    const service = createEasyPostClient('dummy_key');

    (service as any).client = {
      ScanForm: {
        create: async (params: any) => {
          assert.strictEqual(params.shipments.length, 2);
          return {
            id: 'scan_mock_100',
            status: 'created',
            form_url: 'https://easypost-files.s3.amazonaws.com/scan_form.pdf',
            tracking_codes: ['940011111111', '940022222222'],
            batch_id: 'batch_555',
          };
        },
      },
    };

    const res = await service.createScanForm(['shp_1', 'shp_2']);
    assert.strictEqual(res.id, 'scan_mock_100');
    assert.strictEqual(res.status, 'created');
    assert.strictEqual(res.trackingCodes.length, 2);
    assert.strictEqual(res.formUrl, 'https://easypost-files.s3.amazonaws.com/scan_form.pdf');
  });

  await t.test('trackPackage retrieves tracking events and status', async () => {
    const service = createEasyPostClient('dummy_key');

    (service as any).client = {
      Tracker: {
        create: async (params: any) => {
          assert.strictEqual(params.tracking_code, '9400100000000000000000');
          return {
            id: 'trk_100',
            tracking_code: '9400100000000000000000',
            carrier: 'USPS',
            status: 'in_transit',
            tracking_details: [
              {
                datetime: '2026-11-02T10:00:00Z',
                message: 'Departed USPS Regional Facility',
                status: 'in_transit',
                tracking_location: { city: 'LOS ANGELES', state: 'CA', country: 'US' },
              },
            ],
          };
        },
      },
    };

    const res = await service.trackPackage('9400100000000000000000', 'USPS');
    assert.strictEqual(res.tracking_code, '9400100000000000000000');
    assert.strictEqual(res.status, 'in_transit');
    assert.strictEqual(res.events?.length, 1);
    assert.strictEqual(res.events[0].location, 'LOS ANGELES, CA US');
  });

  await t.test('verifyAddress verifies recipient address with delivery success', async () => {
    const service = createEasyPostClient('dummy_key');

    (service as any).client = {
      Address: {
        create: async (params: any) => {
          assert.strictEqual(params.verify, true);
          return {
            street1: '1600 Amphitheatre Pkwy',
            city: 'Mountain View',
            state: 'CA',
            zip: '94043-1351',
            country: 'US',
            residential: false,
            verifications: {
              delivery: {
                success: true,
                errors: [],
              },
            },
          };
        },
      },
    };

    const res = await service.verifyAddress({
      street1: '1600 Amphitheatre Pkwy',
      city: 'Mountain View',
      state: 'CA',
      zip: '94043',
      country: 'US',
    });

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.verifiedAddress.zip, '94043-1351');
    assert.strictEqual(res.verifiedAddress.residential, false);
  });
});
