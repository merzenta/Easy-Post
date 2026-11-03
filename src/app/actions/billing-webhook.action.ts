'use server';

import { subscriptionRepo } from '@/app/repositories/subscription-repo';
import { PlanTierType, MerchantSubscriptionDTO, mapWixPackageToPlanTier } from '@/app/types/subscription.model';
import { logger } from '@/app/utils/logger';

export interface WixBillingWebhookPayload {
  eventType: string;
  instanceId: string;
  data?: {
    vendorProductId?: string;
    packageName?: string;
    subscriptionId?: string;
    billingCycle?: string;
    expiresOn?: string;
  };
  payload?: any;
}

/**
 * Processes incoming Wix App Market billing lifecycle events.
 */
export async function handleWixBillingWebhookEvent(
  params: WixBillingWebhookPayload,
): Promise<MerchantSubscriptionDTO | null> {
  const { eventType, instanceId } = params;
  const data = params.data || params.payload || {};

  if (!instanceId) {
    logger.warn('BILLING_WEBHOOK_MISSING_INSTANCE', 'Webhook received without instanceId', { eventType });
    return null;
  }

  const rawEventType = (eventType || '').toLowerCase();
  const packageId = data.vendorProductId || data.packageId || data.packageName;
  const subscriptionId = data.subscriptionId || data.id;

  logger.info('PROCESSING_BILLING_WEBHOOK', 'Processing Wix App Market billing webhook event', {
    eventType,
    instanceId,
    packageId,
    subscriptionId,
  });

  // 1. Plan Purchased or Upgraded / Changed
  if (
    rawEventType.includes('purchased') ||
    rawEventType.includes('changed') ||
    rawEventType.includes('upgrade') ||
    rawEventType.includes('renew')
  ) {
    const planTier = mapWixPackageToPlanTier(packageId);
    const updated = await subscriptionRepo.updateSubscriptionPlan(instanceId, planTier, packageId, subscriptionId);
    logger.info('SUBSCRIPTION_TIER_UPDATED', 'Tenant successfully upgraded/updated via Wix Webhook', {
      instanceId,
      planTier,
      monthlyQuota: updated.monthlyQuota,
    });
    return updated;
  }

  // 2. Plan Cancelled
  if (rawEventType.includes('cancel')) {
    const updated = await subscriptionRepo.cancelSubscription(instanceId);
    logger.info('SUBSCRIPTION_CANCELLED', 'Tenant subscription marked as cancelled via Wix Webhook', {
      instanceId,
      currentPeriodEnd: updated.currentPeriodEnd,
    });
    return updated;
  }

  logger.info('BILLING_WEBHOOK_UNHANDLED_EVENT', 'Ignored billing webhook event', { eventType });
  return await subscriptionRepo.getSubscription(instanceId);
}
