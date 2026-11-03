import test from 'node:test';
import assert from 'node:assert';
import { handleWixBillingWebhookEvent } from '../../src/app/actions/billing-webhook.action';
import { mapWixPackageToPlanTier } from '../../src/app/types/subscription.model';
import { subscriptionRepo } from '../../src/app/repositories/subscription-repo';

test('Wix App Market Billing & Webhook Processing Unit Tests', async (t) => {
  const testInstanceId = `webhook-test-tenant-${Date.now()}`;

  await t.test('mapWixPackageToPlanTier correctly maps package IDs and names', () => {
    // Starter tier variations
    assert.strictEqual(mapWixPackageToPlanTier('pkg_starter_50_labels'), 'STARTER');
    assert.strictEqual(mapWixPackageToPlanTier('Starter Plan'), 'STARTER');
    assert.strictEqual(mapWixPackageToPlanTier('starter'), 'STARTER');

    // Growth tier variations
    assert.strictEqual(mapWixPackageToPlanTier('pkg_growth_100_labels'), 'GROWTH');
    assert.strictEqual(mapWixPackageToPlanTier('Growth Plan'), 'GROWTH');
    assert.strictEqual(mapWixPackageToPlanTier('growth'), 'GROWTH');

    // Unlimited tier variations
    assert.strictEqual(mapWixPackageToPlanTier('pkg_unlimited_labels'), 'UNLIMITED');
    assert.strictEqual(mapWixPackageToPlanTier('Unlimited Plan'), 'UNLIMITED');
    assert.strictEqual(mapWixPackageToPlanTier('unlimited'), 'UNLIMITED');

    // Free tier & fallbacks
    assert.strictEqual(mapWixPackageToPlanTier('basic'), 'FREE');
    assert.strictEqual(mapWixPackageToPlanTier('Basic'), 'FREE');
    assert.strictEqual(mapWixPackageToPlanTier('pkg_free_trial'), 'FREE');
    assert.strictEqual(mapWixPackageToPlanTier(''), 'FREE');
    assert.strictEqual(mapWixPackageToPlanTier(null), 'FREE');
    assert.strictEqual(mapWixPackageToPlanTier('unknown_custom_package'), 'FREE');
  });

  await t.test('handleWixBillingWebhookEvent processes PAID_PLAN_PURCHASED to STARTER plan', async () => {
    const updated = await handleWixBillingWebhookEvent({
      eventType: 'wix.app_market.plan_purchased',
      instanceId: testInstanceId,
      data: {
        vendorProductId: 'pkg_starter_50_labels',
        packageName: 'Starter Plan',
        subscriptionId: 'sub_wix_starter_123',
      },
    });

    assert.ok(updated);
    assert.strictEqual(updated.planType, 'STARTER');
    assert.strictEqual(updated.monthlyQuota, 50);
    assert.strictEqual(updated.priceMonthly, 5.0);
    assert.strictEqual(updated.status, 'ACTIVE');

    // Verify stored state in DB
    const stored = await subscriptionRepo.getSubscription(testInstanceId);
    assert.ok(stored);
    assert.strictEqual(stored.planType, 'STARTER');
    assert.strictEqual(stored.monthlyQuota, 50);
  });

  await t.test('handleWixBillingWebhookEvent processes PAID_PLAN_CHANGED to GROWTH plan', async () => {
    const updated = await handleWixBillingWebhookEvent({
      eventType: 'wix.app_market.plan_changed',
      instanceId: testInstanceId,
      data: {
        vendorProductId: 'pkg_growth_100_labels',
        packageName: 'Growth Plan',
        subscriptionId: 'sub_wix_growth_456',
      },
    });

    assert.ok(updated);
    assert.strictEqual(updated.planType, 'GROWTH');
    assert.strictEqual(updated.monthlyQuota, 100);
    assert.strictEqual(updated.priceMonthly, 10.0);
  });

  await t.test('handleWixBillingWebhookEvent processes PAID_PLAN_PURCHASED to UNLIMITED plan', async () => {
    const updated = await handleWixBillingWebhookEvent({
      eventType: 'PAID_PLAN_PURCHASED',
      instanceId: testInstanceId,
      data: {
        vendorProductId: 'pkg_unlimited_labels',
        packageName: 'Unlimited Plan',
        subscriptionId: 'sub_wix_unlimited_789',
      },
    });

    assert.ok(updated);
    assert.strictEqual(updated.planType, 'UNLIMITED');
    assert.strictEqual(updated.monthlyQuota, -1);
    assert.strictEqual(updated.priceMonthly, 20.0);
  });

  await t.test('handleWixBillingWebhookEvent processes PAID_PLAN_CANCELLED', async () => {
    const cancelled = await handleWixBillingWebhookEvent({
      eventType: 'wix.app_market.plan_cancelled',
      instanceId: testInstanceId,
      data: {
        vendorProductId: 'pkg_unlimited_labels',
      },
    });

    assert.ok(cancelled);
    assert.strictEqual(cancelled.status, 'CANCELLED');
    assert.ok(cancelled.cancelledAt);

    // Verify stored state in DB reflects cancellation
    const stored = await subscriptionRepo.getSubscription(testInstanceId);
    assert.ok(stored);
    assert.strictEqual(stored.status, 'CANCELLED');
  });

  await t.test('returns null gracefully when instanceId is missing', async () => {
    const res = await handleWixBillingWebhookEvent({
      eventType: 'wix.app_market.plan_purchased',
      instanceId: '',
      data: { vendorProductId: 'pkg_starter_50_labels' },
    });
    assert.strictEqual(res, null);
  });
});
