import test from 'node:test';
import assert from 'node:assert';
import { SUBSCRIPTION_PLANS, PlanTierType } from '../../src/app/types/subscription.model';
import { getWixUpgradeCheckoutUrl } from '../../src/app/utils/wix-checkout';

test('Billing Dashboard UI & Upgrade Modal Unit Tests', async (t) => {
  await t.test('all 4 subscription tiers match the exact business quota and pricing specification', () => {
    // 1. Basic (Free) Plan
    const free = SUBSCRIPTION_PLANS.FREE;
    assert.strictEqual(free.name, 'Basic');
    assert.strictEqual(free.monthlyPriceUSD, 0);
    assert.strictEqual(free.monthlyLabelQuota, 5);
    assert.strictEqual(free.wixPackageId, 'basic');

    // 2. Starter Plan ($5 / 50 labels / 20% discount)
    const starter = SUBSCRIPTION_PLANS.STARTER;
    assert.strictEqual(starter.name, 'Starter');
    assert.strictEqual(starter.monthlyPriceUSD, 5);
    assert.strictEqual(starter.monthlyLabelQuota, 50);
    assert.strictEqual(starter.wixPackageId, 'starter');
    assert.strictEqual(starter.yearlyDiscountPercent, 20);

    // 3. Growth Plan ($10 / 100 labels / 20% discount)
    const growth = SUBSCRIPTION_PLANS.GROWTH;
    assert.strictEqual(growth.name, 'Growth');
    assert.strictEqual(growth.monthlyPriceUSD, 10);
    assert.strictEqual(growth.monthlyLabelQuota, 100);
    assert.strictEqual(growth.wixPackageId, 'growth');
    assert.strictEqual(growth.yearlyDiscountPercent, 20);

    // 4. Unlimited Plan ($20 / Unlimited labels / 10% discount)
    const unlimited = SUBSCRIPTION_PLANS.UNLIMITED;
    assert.strictEqual(unlimited.name, 'Unlimited');
    assert.strictEqual(unlimited.monthlyPriceUSD, 20);
    assert.strictEqual(unlimited.monthlyLabelQuota, -1);
    assert.strictEqual(unlimited.wixPackageId, 'unlimited');
    assert.strictEqual(unlimited.yearlyDiscountPercent, 10);
  });

  await t.test('generates valid Wix App Market hosted checkout URLs', () => {
    const starterUrl = getWixUpgradeCheckoutUrl(SUBSCRIPTION_PLANS.STARTER.wixPackageId);
    assert.ok(starterUrl.startsWith('https://www.wix.com/app-market/checkout?'));
    assert.ok(starterUrl.includes('packageId=starter'));

    const unlimitedUrl = getWixUpgradeCheckoutUrl(SUBSCRIPTION_PLANS.UNLIMITED.wixPackageId);
    assert.ok(unlimitedUrl.includes('packageId=unlimited'));

    const genericUrl = getWixUpgradeCheckoutUrl();
    assert.ok(genericUrl.includes('appDefinitionId='));
  });

  await t.test('calculates correct visual progress percentages and skins across quota tiers', () => {
    function computeProgress(used: number, quota: number) {
      if (quota === -1) return { percent: 0, skin: 'success', isExhausted: false };
      const percent = Math.min(100, Math.round((used / Math.max(1, quota)) * 100));
      const skin = percent >= 75 ? 'warning' : 'success';
      const isExhausted = used >= quota;
      return { percent, skin, isExhausted };
    }

    // 0 of 5 used (Free plan start)
    const p0 = computeProgress(0, 5);
    assert.strictEqual(p0.percent, 0);
    assert.strictEqual(p0.skin, 'success');
    assert.strictEqual(p0.isExhausted, false);

    // 3 of 5 used (60%)
    const p3 = computeProgress(3, 5);
    assert.strictEqual(p3.percent, 60);
    assert.strictEqual(p3.skin, 'success');
    assert.strictEqual(p3.isExhausted, false);

    // 4 of 5 used (80% - warning threshold)
    const p4 = computeProgress(4, 5);
    assert.strictEqual(p4.percent, 80);
    assert.strictEqual(p4.skin, 'warning');
    assert.strictEqual(p4.isExhausted, false);

    // 5 of 5 used (100% - exhausted limit)
    const p5 = computeProgress(5, 5);
    assert.strictEqual(p5.percent, 100);
    assert.strictEqual(p5.skin, 'warning');
    assert.strictEqual(p5.isExhausted, true);

    // Unlimited Plan (125 labels generated, quota = -1)
    const pUnl = computeProgress(125, -1);
    assert.strictEqual(pUnl.percent, 0);
    assert.strictEqual(pUnl.skin, 'success');
    assert.strictEqual(pUnl.isExhausted, false);
  });

  await t.test('in-flow quota exceeded error pattern matches expected server exceptions', () => {
    function isQuotaExceededError(errMessage: string): boolean {
      const msg = errMessage || '';
      return (
        msg.includes('MONTHLY_LABEL_QUOTA_EXCEEDED') ||
        msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('limit reached')
      );
    }

    const serverException =
      'MONTHLY_LABEL_QUOTA_EXCEEDED: Monthly label limit reached (5/5). Please upgrade your plan in Plans & Billing to generate more labels.';
    assert.strictEqual(isQuotaExceededError(serverException), true);

    const friendlyError = 'Monthly label limit reached (50/50)';
    assert.strictEqual(isQuotaExceededError(friendlyError), true);

    const genericError = 'EasyPost API invalid credentials';
    assert.strictEqual(isQuotaExceededError(genericError), false);
  });
});
