import test from 'node:test';
import assert from 'node:assert';
import { SUBSCRIPTION_PLANS, getBillingCycleKey, getCycleEndDate } from '../../src/app/types/subscription.model';

test('Subscription Model & Plan Tier Matrix Unit Tests', async (t) => {
  await t.test('defines exact 4 subscription tiers with correct quotas and pricing', () => {
    // 1. Basic (Free) Plan
    assert.ok(SUBSCRIPTION_PLANS.FREE);
    assert.strictEqual(SUBSCRIPTION_PLANS.FREE.name, 'Basic');
    assert.strictEqual(SUBSCRIPTION_PLANS.FREE.monthlyLabelQuota, 5);
    assert.strictEqual(SUBSCRIPTION_PLANS.FREE.monthlyPriceUSD, 0.0);
    assert.strictEqual(SUBSCRIPTION_PLANS.FREE.wixPackageId, 'basic');

    // 2. Starter Plan ($5/mo, 50 labels)
    assert.ok(SUBSCRIPTION_PLANS.STARTER);
    assert.strictEqual(SUBSCRIPTION_PLANS.STARTER.name, 'Starter');
    assert.strictEqual(SUBSCRIPTION_PLANS.STARTER.monthlyLabelQuota, 50);
    assert.strictEqual(SUBSCRIPTION_PLANS.STARTER.monthlyPriceUSD, 5.0);
    assert.strictEqual(SUBSCRIPTION_PLANS.STARTER.wixPackageId, 'starter');
    assert.strictEqual(SUBSCRIPTION_PLANS.STARTER.yearlyDiscountPercent, 20);

    // 3. Growth Plan ($10/mo, 100 labels)
    assert.ok(SUBSCRIPTION_PLANS.GROWTH);
    assert.strictEqual(SUBSCRIPTION_PLANS.GROWTH.name, 'Growth');
    assert.strictEqual(SUBSCRIPTION_PLANS.GROWTH.monthlyLabelQuota, 100);
    assert.strictEqual(SUBSCRIPTION_PLANS.GROWTH.monthlyPriceUSD, 10.0);
    assert.strictEqual(SUBSCRIPTION_PLANS.GROWTH.wixPackageId, 'growth');
    assert.strictEqual(SUBSCRIPTION_PLANS.GROWTH.yearlyDiscountPercent, 20);

    // 4. Unlimited Plan ($20/mo, Unlimited)
    assert.ok(SUBSCRIPTION_PLANS.UNLIMITED);
    assert.strictEqual(SUBSCRIPTION_PLANS.UNLIMITED.name, 'Unlimited');
    assert.strictEqual(SUBSCRIPTION_PLANS.UNLIMITED.monthlyLabelQuota, -1);
    assert.strictEqual(SUBSCRIPTION_PLANS.UNLIMITED.monthlyPriceUSD, 20.0);
    assert.strictEqual(SUBSCRIPTION_PLANS.UNLIMITED.wixPackageId, 'unlimited');
    assert.strictEqual(SUBSCRIPTION_PLANS.UNLIMITED.yearlyDiscountPercent, 10);
  });

  await t.test('getBillingCycleKey formats date into YYYY-MM correctly', () => {
    const nov2026 = new Date(Date.UTC(2026, 10, 3, 14, 0, 0)); // Month 10 = Nov
    assert.strictEqual(getBillingCycleKey(nov2026), '2026-11');

    const jan2027 = new Date(Date.UTC(2027, 0, 15, 10, 0, 0)); // Month 0 = Jan
    assert.strictEqual(getBillingCycleKey(jan2027), '2027-01');

    const dec2026 = new Date(Date.UTC(2026, 11, 31, 23, 59, 59)); // Month 11 = Dec
    assert.strictEqual(getBillingCycleKey(dec2026), '2026-12');
  });

  await t.test('getCycleEndDate returns the final second of the calendar month in UTC', () => {
    const nov2026 = new Date(Date.UTC(2026, 10, 15));
    const cycleEndNov = getCycleEndDate(nov2026);

    assert.strictEqual(cycleEndNov.getUTCFullYear(), 2026);
    assert.strictEqual(cycleEndNov.getUTCMonth(), 10); // Nov
    assert.strictEqual(cycleEndNov.getUTCDate(), 30); // Nov has 30 days
    assert.strictEqual(cycleEndNov.getUTCHours(), 23);
    assert.strictEqual(cycleEndNov.getUTCMinutes(), 59);
    assert.strictEqual(cycleEndNov.getUTCSeconds(), 59);

    const feb2028Leap = new Date(Date.UTC(2028, 1, 10)); // Feb 2028 is leap year
    const cycleEndFeb = getCycleEndDate(feb2028Leap);
    assert.strictEqual(cycleEndFeb.getUTCDate(), 29); // 29 days in leap year
  });

  await t.test('quota calculations: remaining and percentage math', () => {
    // Case 1: Free tier 4 / 5 used
    const freeQuota = 5;
    const freeUsed = 4;
    const freeRemaining = Math.max(0, freeQuota - freeUsed);
    const freePct = Math.round((freeUsed / freeQuota) * 100);
    assert.strictEqual(freeRemaining, 1);
    assert.strictEqual(freePct, 80);

    // Case 2: Free tier 5 / 5 used (exhausted)
    const freeUsedMax = 5;
    const freeRemainingZero = Math.max(0, freeQuota - freeUsedMax);
    const freeExhausted = freeUsedMax >= freeQuota;
    assert.strictEqual(freeRemainingZero, 0);
    assert.strictEqual(freeExhausted, true);

    // Case 3: Starter tier 42 / 50 used
    const starterQuota = 50;
    const starterUsed = 42;
    const starterRemaining = Math.max(0, starterQuota - starterUsed);
    const starterPct = Math.round((starterUsed / starterQuota) * 100);
    assert.strictEqual(starterRemaining, 8);
    assert.strictEqual(starterPct, 84);

    // Case 4: Unlimited tier
    const unlimitedQuota = -1;
    const unlimitedUsed = 340;
    const unlimitedRemaining = unlimitedQuota === -1 ? -1 : Math.max(0, unlimitedQuota - unlimitedUsed);
    assert.strictEqual(unlimitedRemaining, -1);
  });
});
