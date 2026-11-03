import test from 'node:test';
import assert from 'node:assert';
import { checkQuotaAvailable, assertQuotaAvailable, QuotaExceededError } from '../../src/app/utils/quota-engine';
import { subscriptionRepo } from '../../src/app/repositories/subscription-repo';

test('Quota Engine & Label Enforcement Unit Tests', async (t) => {
  const testInstanceId = `test-tenant-${Date.now()}`;

  await t.test('initializes new tenant on FREE tier with 5 labels allowance', async () => {
    const summary = await subscriptionRepo.getSubscriptionSummary(testInstanceId);
    assert.strictEqual(summary.subscription.planType, 'FREE');
    assert.strictEqual(summary.subscription.monthlyQuota, 5);
    assert.strictEqual(summary.currentUsage.labelsGenerated, 0);
    assert.strictEqual(summary.remainingLabels, 5);
    assert.strictEqual(summary.usagePercentage, 0);
    assert.strictEqual(summary.isExhausted, false);
  });

  await t.test('assertQuotaAvailable allows label purchase when under quota', async () => {
    const result = await assertQuotaAvailable(testInstanceId);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.planType, 'FREE');
    assert.strictEqual(result.monthlyQuota, 5);
    assert.strictEqual(result.remainingLabels, 5);
  });

  await t.test('atomically increments quota count upon label purchase', async () => {
    // Record 4 label purchases
    for (let i = 1; i <= 4; i++) {
      const res = await subscriptionRepo.recordLabelPurchaseUsage({
        instanceId: testInstanceId,
        shipmentId: `shp-test-${i}`,
        trackingCode: `9400${i}`,
        carrier: 'USPS',
        service: 'GroundAdvantage',
        rateAmount: 7.95,
      });
      assert.strictEqual(res.newCount, i);
      assert.strictEqual(res.remaining, 5 - i);
    }

    const check = await checkQuotaAvailable(testInstanceId);
    assert.strictEqual(check.allowed, true);
    assert.strictEqual(check.labelsGenerated, 4);
    assert.strictEqual(check.remainingLabels, 1);
  });

  await t.test('throws QuotaExceededError when monthly quota is reached (5/5)', async () => {
    // Purchase 5th label to exhaust quota
    const res5 = await subscriptionRepo.recordLabelPurchaseUsage({
      instanceId: testInstanceId,
      shipmentId: 'shp-test-5',
      trackingCode: '94005',
      carrier: 'USPS',
      service: 'GroundAdvantage',
      rateAmount: 7.95,
    });
    assert.strictEqual(res5.newCount, 5);
    assert.strictEqual(res5.remaining, 0);

    const check = await checkQuotaAvailable(testInstanceId);
    assert.strictEqual(check.allowed, false);
    assert.strictEqual(check.remainingLabels, 0);

    // assertQuotaAvailable must throw QuotaExceededError
    await assert.rejects(
      async () => {
        await assertQuotaAvailable(testInstanceId);
      },
      (err: any) => {
        assert.ok(err instanceof QuotaExceededError);
        assert.strictEqual(err.code, 'MONTHLY_LABEL_QUOTA_EXCEEDED');
        assert.strictEqual(err.details.monthlyQuota, 5);
        assert.strictEqual(err.details.labelsGenerated, 5);
        assert.strictEqual(err.details.remainingLabels, 0);
        return true;
      },
    );
  });

  await t.test('upgrades tenant to STARTER plan and unlocks 50 labels quota', async () => {
    await subscriptionRepo.updateSubscriptionPlan(testInstanceId, 'STARTER', 'pkg_starter_50_labels');

    const check = await checkQuotaAvailable(testInstanceId);
    assert.strictEqual(check.allowed, true);
    assert.strictEqual(check.planType, 'STARTER');
    assert.strictEqual(check.monthlyQuota, 50);
    assert.strictEqual(check.labelsGenerated, 5);
    assert.strictEqual(check.remainingLabels, 45); // 50 - 5 = 45 remaining
    assert.strictEqual(
      check.upgradeUrl,
      `https://www.wix.com/apps/upgrade/4bf163d4-50ce-46f8-8e30-9ac3766e312f?appInstanceId=${testInstanceId}`,
    );

    // assertQuotaAvailable passes now
    const allowedResult = await assertQuotaAvailable(testInstanceId);
    assert.strictEqual(allowedResult.allowed, true);
  });

  await t.test('UNLIMITED tier has zero quota restrictions', async () => {
    await subscriptionRepo.updateSubscriptionPlan(testInstanceId, 'UNLIMITED', 'pkg_unlimited_labels');

    const check = await checkQuotaAvailable(testInstanceId);
    assert.strictEqual(check.allowed, true);
    assert.strictEqual(check.planType, 'UNLIMITED');
    assert.strictEqual(check.monthlyQuota, -1);
    assert.strictEqual(check.remainingLabels, -1);

    const allowedResult = await assertQuotaAvailable(testInstanceId);
    assert.strictEqual(allowedResult.allowed, true);
    assert.strictEqual(allowedResult.remainingLabels, -1);
  });
});
