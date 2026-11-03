import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeStateCode, extractOrderRecipient } from '../../src/app/utils/address-helper';

describe('Address Helper & Recipient Extraction Tests', () => {
  it('normalizes ISO-3166-2 and state names to 2-letter codes for US', () => {
    assert.strictEqual(normalizeStateCode('US-NJ', 'US'), 'NJ');
    assert.strictEqual(normalizeStateCode('US-CA', 'US'), 'CA');
    assert.strictEqual(normalizeStateCode('us-ny', 'US'), 'NY');
    assert.strictEqual(normalizeStateCode('New Jersey', 'US'), 'NJ');
    assert.strictEqual(normalizeStateCode('CALIFORNIA', 'US'), 'CA');
    assert.strictEqual(normalizeStateCode('texas', 'US'), 'TX');
    assert.strictEqual(normalizeStateCode('NJ', 'US'), 'NJ');
    assert.strictEqual(normalizeStateCode('CA', 'US'), 'CA');
  });

  it('normalizes international subdivision codes cleanly', () => {
    assert.strictEqual(normalizeStateCode('AU-NSW', 'AU'), 'NSW');
    assert.strictEqual(normalizeStateCode('CA-ON', 'CA'), 'ON');
  });

  it('extracts recipient name from shippingDestination.contactDetails', () => {
    const order = {
      shippingInfo: {
        logistics: {
          shippingDestination: {
            contactDetails: {
              firstName: 'Jane',
              lastName: 'Doe',
              phone: '5551234567',
            },
            address: {
              addressLine1: '100 Main St',
              city: 'Newark',
              subdivision: 'US-NJ',
              postalCode: '07114',
              country: 'US',
            },
          },
        },
      },
    };

    const recipient = extractOrderRecipient(order);
    assert.strictEqual(recipient.name, 'Jane Doe');
    assert.strictEqual(recipient.phone, '5551234567');
    assert.strictEqual(recipient.street1, '100 Main St');
    assert.strictEqual(recipient.city, 'Newark');
    assert.strictEqual(recipient.state, 'NJ');
    assert.strictEqual(recipient.zip, '07114');
    assert.strictEqual(recipient.country, 'US');
  });

  it('extracts recipient name from billingInfo if shipping contact is absent', () => {
    const order = {
      billingInfo: {
        contactDetails: {
          firstName: 'Robert',
          lastName: 'Paulson',
          phone: '9998887777',
        },
      },
      shippingInfo: {
        logistics: {
          shippingDestination: {
            address: {
              addressLine1: '200 Market St',
              city: 'San Francisco',
              subdivision: 'CA',
              postalCode: '94105',
              country: 'US',
            },
          },
        },
      },
    };

    const recipient = extractOrderRecipient(order);
    assert.strictEqual(recipient.name, 'Robert Paulson');
    assert.strictEqual(recipient.phone, '9998887777');
    assert.strictEqual(recipient.state, 'CA');
  });

  it('falls back to capitalized email name if no contact name exists', () => {
    const order = {
      buyerInfo: {
        email: 'manish@example.com',
      },
      shippingInfo: {
        logistics: {
          shippingDestination: {
            address: {
              addressLine1: '500 Broad St',
              city: 'Newark',
              subdivision: 'US-NJ',
              postalCode: '07102',
              country: 'US',
            },
          },
        },
      },
    };

    const recipient = extractOrderRecipient(order);
    assert.strictEqual(recipient.name, 'Manish');
    assert.strictEqual(recipient.email, 'manish@example.com');
    assert.strictEqual(recipient.state, 'NJ');
  });
});
