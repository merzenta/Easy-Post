'use server';

import { AppIdentifier, resolveInstanceId, resolveInstanceWithBilling } from '@/app/actions/app-data';
import { subscriptionRepo } from '@/app/repositories/subscription-repo';
import { checkQuotaAvailable, QuotaCheckResult } from '@/app/utils/quota-engine';
import { PlanTierType, SubscriptionStatusSummary, mapWixPackageToPlanTier } from '@/app/types/subscription.model';
import { createTenantLogger } from '@/app/utils/logger';

/**
 * Retrieves the comprehensive subscription and quota summary for the current merchant.
 * Synchronizes with Wix App Market billing if present in the signed instance token.
 */
export async function getSubscriptionSummaryAction(appIdentifier: AppIdentifier): Promise<SubscriptionStatusSummary> {
  const { instanceId, billing } = await resolveInstanceWithBilling(appIdentifier);

  // If Wix signed instance token contains billing info, synchronize with database
  if (billing?.vendorProductId || billing?.packageName) {
    const detectedPlan = mapWixPackageToPlanTier(billing.vendorProductId || billing.packageName);
    const existing = await subscriptionRepo.getSubscription(instanceId);
    if (!existing || existing.planType !== detectedPlan) {
      await subscriptionRepo.updateSubscriptionPlan(instanceId, detectedPlan, billing.vendorProductId);
    }
  }

  return await subscriptionRepo.getSubscriptionSummary(instanceId);
}

/**
 * Checks if the current merchant has remaining quota to generate postage labels.
 */
export async function checkQuotaAction(appIdentifier: AppIdentifier): Promise<QuotaCheckResult> {
  const instanceId = await resolveInstanceId(appIdentifier);
  return await checkQuotaAvailable(instanceId);
}

/**
 * Updates the merchant's subscription tier.
 */
export async function updateSubscriptionTierAction(
  planType: PlanTierType,
  appIdentifier: AppIdentifier,
  wixPackageId?: string,
): Promise<SubscriptionStatusSummary> {
  const instanceId = await resolveInstanceId(appIdentifier);
  const logger = createTenantLogger(instanceId, undefined, undefined, 'actions/updateSubscription');

  logger.info('UPGRADING_SUBSCRIPTION', 'Merchant upgrading plan tier', {
    planType,
    wixPackageId,
  });

  await subscriptionRepo.updateSubscriptionPlan(instanceId, planType, wixPackageId);
  return await subscriptionRepo.getSubscriptionSummary(instanceId);
}
