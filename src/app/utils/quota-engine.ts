/**
 * Server-side Quota Engine & Guard for EasyPost Label Purchasing.
 */

import { subscriptionRepo } from '@/app/repositories/subscription-repo';
import { PlanTierType, SUBSCRIPTION_PLANS, getBillingCycleKey } from '@/app/types/subscription.model';
import { logger } from '@/app/utils/logger';

export interface QuotaCheckResult {
  allowed: boolean;
  planType: PlanTierType;
  monthlyQuota: number; // -1 for unlimited
  labelsGenerated: number;
  remainingLabels: number; // -1 for unlimited
  resetDate: Date;
  upgradeUrl?: string;
}

export class QuotaExceededError extends Error {
  code = 'MONTHLY_LABEL_QUOTA_EXCEEDED';
  details: QuotaCheckResult;

  constructor(details: QuotaCheckResult) {
    super(
      `Monthly label limit of ${details.monthlyQuota} reached for the ${details.planType} plan. Upgrade your plan to generate more shipping labels.`,
    );
    this.name = 'QuotaExceededError';
    this.details = details;
  }
}

/**
 * Checks if the tenant has quota available in the current billing cycle without throwing.
 */
export async function checkQuotaAvailable(instanceId: string): Promise<QuotaCheckResult> {
  const currentCycleKey = getBillingCycleKey();

  // 1. Fetch or initialize subscription (defaults to FREE tier with 5 labels)
  const subscription = await subscriptionRepo.getOrCreateSubscription(instanceId);

  // 2. Unlimited plan has zero restrictions
  if (subscription.planType === 'UNLIMITED' || subscription.monthlyQuota === -1) {
    return {
      allowed: true,
      planType: 'UNLIMITED',
      monthlyQuota: -1,
      labelsGenerated: 0,
      remainingLabels: -1,
      resetDate: subscription.currentPeriodEnd,
    };
  }

  // 3. Fetch current monthly usage
  const usage = await subscriptionRepo.getOrCreateMonthlyUsage(instanceId, currentCycleKey);

  const allowed = usage.labelsGenerated < subscription.monthlyQuota;
  const remaining = Math.max(0, subscription.monthlyQuota - usage.labelsGenerated);

  const appDefId = process.env.NEXT_PUBLIC_WIX_APP_ID || '4bf163d4-50ce-46f8-8e30-9ac3766e312f';
  const upgradeUrl = appDefId ? `https://www.wix.com/apps/upgrade/${appDefId}?appInstanceId=${instanceId}` : undefined;

  return {
    allowed,
    planType: subscription.planType as PlanTierType,
    monthlyQuota: subscription.monthlyQuota,
    labelsGenerated: usage.labelsGenerated,
    remainingLabels: remaining,
    resetDate: subscription.currentPeriodEnd,
    upgradeUrl,
  };
}

/**
 * Asserts that the tenant has quota available. Throws QuotaExceededError if exhausted.
 */
export async function assertQuotaAvailable(instanceId: string): Promise<QuotaCheckResult> {
  const result = await checkQuotaAvailable(instanceId);

  if (!result.allowed) {
    logger.warn('QUOTA_LIMIT_EXCEEDED', 'Tenant attempted to purchase label with exhausted quota', {
      instanceId,
      planType: result.planType,
      monthlyQuota: result.monthlyQuota,
      labelsGenerated: result.labelsGenerated,
    });
    throw new QuotaExceededError(result);
  }

  return result;
}
