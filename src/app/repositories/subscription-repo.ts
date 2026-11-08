/**
 * PostgreSQL Database Repository for Merchant Subscriptions, Monthly Label Quotas, and Audit Logs.
 */

import { getPrismaClient } from '@/app/utils/prisma';
import {
  PlanTierType,
  SUBSCRIPTION_PLANS,
  MerchantSubscriptionDTO,
  MonthlyUsageDTO,
  SubscriptionStatusSummary,
  getBillingCycleKey,
  getCycleEndDate,
} from '@/app/types/subscription.model';
import { logger } from '@/app/utils/logger';

export class SubscriptionRepository {
  /**
   * Retrieves active subscription for a tenant, or null if not yet initialized.
   */
  async getSubscription(instanceId: string): Promise<MerchantSubscriptionDTO | null> {
    const prisma = getPrismaClient();
    const record = await prisma.merchantSubscription.findUnique({
      where: { instanceId },
    });
    if (!record) return null;
    return this.mapSubscription(record);
  }

  /**
   * Retrieves active subscription, or initializes tenant on the FREE tier (5 labels/mo) if not found.
   */
  async getOrCreateSubscription(instanceId: string): Promise<MerchantSubscriptionDTO> {
    const prisma = getPrismaClient();
    const now = new Date();
    const cycleEnd = getCycleEndDate(now);

    const record = await prisma.merchantSubscription.upsert({
      where: { instanceId },
      update: {},
      create: {
        instanceId,
        planType: 'FREE',
        status: 'ACTIVE',
        monthlyQuota: SUBSCRIPTION_PLANS.FREE.monthlyLabelQuota,
        priceMonthly: SUBSCRIPTION_PLANS.FREE.monthlyPriceUSD,
        wixPackageId: SUBSCRIPTION_PLANS.FREE.wixPackageId,
        currentPeriodStart: now,
        currentPeriodEnd: cycleEnd,
      },
    });

    return this.mapSubscription(record);
  }

  /**
   * Updates or upgrades tenant to a new subscription tier (e.g. via Wix App Market).
   */
  async updateSubscriptionPlan(
    instanceId: string,
    planType: PlanTierType,
    wixPackageId?: string,
    wixSubscriptionId?: string,
  ): Promise<MerchantSubscriptionDTO> {
    const prisma = getPrismaClient();
    const planConfig = SUBSCRIPTION_PLANS[planType] || SUBSCRIPTION_PLANS.FREE;
    const now = new Date();
    const cycleEnd = getCycleEndDate(now);

    logger.info('UPDATING_SUBSCRIPTION_PLAN', 'Updating tenant subscription tier', {
      instanceId,
      planType,
      monthlyQuota: planConfig.monthlyLabelQuota,
      priceMonthly: planConfig.monthlyPriceUSD,
    });

    const record = await prisma.merchantSubscription.upsert({
      where: { instanceId },
      update: {
        planType,
        status: 'ACTIVE',
        monthlyQuota: planConfig.monthlyLabelQuota,
        priceMonthly: planConfig.monthlyPriceUSD,
        wixPackageId: wixPackageId || planConfig.wixPackageId,
        wixSubscriptionId: wixSubscriptionId || undefined,
        currentPeriodEnd: cycleEnd,
        cancelledAt: null,
      },
      create: {
        instanceId,
        planType,
        status: 'ACTIVE',
        monthlyQuota: planConfig.monthlyLabelQuota,
        priceMonthly: planConfig.monthlyPriceUSD,
        wixPackageId: wixPackageId || planConfig.wixPackageId,
        wixSubscriptionId: wixSubscriptionId || undefined,
        currentPeriodStart: now,
        currentPeriodEnd: cycleEnd,
      },
    });

    return this.mapSubscription(record);
  }

  /**
   * Marks subscription as cancelled (access remains until currentPeriodEnd).
   * Safely handles case where tenant record does not exist in DB yet.
   */
  async cancelSubscription(instanceId: string): Promise<MerchantSubscriptionDTO> {
    const prisma = getPrismaClient();
    const existing = await prisma.merchantSubscription.findUnique({
      where: { instanceId },
    });

    if (!existing) {
      const now = new Date();
      const cycleEnd = getCycleEndDate(now);
      const created = await prisma.merchantSubscription.create({
        data: {
          instanceId,
          planType: 'FREE',
          status: 'CANCELLED',
          monthlyQuota: 5,
          priceMonthly: 0,
          currentPeriodStart: now,
          currentPeriodEnd: cycleEnd,
          cancelledAt: now,
        },
      });
      return this.mapSubscription(created);
    }

    const record = await prisma.merchantSubscription.update({
      where: { instanceId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });
    return this.mapSubscription(record);
  }

  /**
   * Retrieves or initializes usage record for the given billing cycle (e.g. "2026-11").
   */
  async getOrCreateMonthlyUsage(instanceId: string, billingCycleKey?: string): Promise<MonthlyUsageDTO> {
    const prisma = getPrismaClient();
    const cycleKey = billingCycleKey || getBillingCycleKey();

    const record = await prisma.monthlyUsage.upsert({
      where: {
        instanceId_billingCycleKey: {
          instanceId,
          billingCycleKey: cycleKey,
        },
      },
      update: {},
      create: {
        instanceId,
        billingCycleKey: cycleKey,
        labelsGenerated: 0,
      },
    });

    return this.mapUsage(record);
  }

  /**
   * Atomically records a successfully purchased shipping label, increments monthly count, and writes an audit log.
   */
  async recordLabelPurchaseUsage(params: {
    instanceId: string;
    shipmentId: string;
    trackingCode?: string;
    carrier: string;
    service: string;
    rateAmount: number;
  }): Promise<{ newCount: number; remaining: number }> {
    const prisma = getPrismaClient();
    const currentCycleKey = getBillingCycleKey();

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch current subscription
      const sub = await tx.merchantSubscription.findUnique({
        where: { instanceId: params.instanceId },
      });
      const planType = (sub?.planType as PlanTierType) || 'FREE';
      const monthlyQuota = sub?.monthlyQuota ?? 5;

      // 2. Increment usage atomically
      const updatedUsage = await tx.monthlyUsage.upsert({
        where: {
          instanceId_billingCycleKey: {
            instanceId: params.instanceId,
            billingCycleKey: currentCycleKey,
          },
        },
        update: {
          labelsGenerated: { increment: 1 },
          lastLabelGeneratedAt: new Date(),
        },
        create: {
          instanceId: params.instanceId,
          billingCycleKey: currentCycleKey,
          labelsGenerated: 1,
          lastLabelGeneratedAt: new Date(),
        },
      });

      // 3. Insert immutable usage log
      await tx.subscriptionUsageLog.create({
        data: {
          instanceId: params.instanceId,
          shipmentId: params.shipmentId,
          trackingCode: params.trackingCode,
          carrier: params.carrier,
          service: params.service,
          rateAmount: params.rateAmount,
          planType,
          quotaCountAfter: updatedUsage.labelsGenerated,
          subscriptionId: sub?.id,
        },
      });

      const remaining = monthlyQuota === -1 ? -1 : Math.max(0, monthlyQuota - updatedUsage.labelsGenerated);

      logger.info('LABEL_USAGE_RECORDED', 'Label quota consumed successfully', {
        instanceId: params.instanceId,
        cycle: currentCycleKey,
        newCount: updatedUsage.labelsGenerated,
        remaining,
        planType,
      });

      return {
        newCount: updatedUsage.labelsGenerated,
        remaining,
      };
    });
  }

  /**
   * Retrieves high-level subscription status summary (plan, usage bar, remaining, reset date).
   */
  async getSubscriptionSummary(instanceId: string): Promise<SubscriptionStatusSummary> {
    const subscription = await this.getOrCreateSubscription(instanceId);
    const usage = await this.getOrCreateMonthlyUsage(instanceId);
    const planConfig = SUBSCRIPTION_PLANS[subscription.planType] || SUBSCRIPTION_PLANS.FREE;

    const isUnlimited = subscription.monthlyQuota === -1;
    const remaining = isUnlimited ? -1 : Math.max(0, subscription.monthlyQuota - usage.labelsGenerated);
    const usagePercentage = isUnlimited
      ? 0
      : Math.min(100, Math.round((usage.labelsGenerated / subscription.monthlyQuota) * 100));

    const isExhausted = !isUnlimited && usage.labelsGenerated >= subscription.monthlyQuota;

    return {
      subscription,
      planConfig,
      currentUsage: usage,
      remainingLabels: remaining,
      usagePercentage,
      isExhausted,
      cycleResetDate: subscription.currentPeriodEnd,
    };
  }

  /**
   * Retrieves historical monthly usage records for analytics.
   */
  async getUsageHistory(instanceId: string, limit = 12): Promise<MonthlyUsageDTO[]> {
    const prisma = getPrismaClient();
    const records = await prisma.monthlyUsage.findMany({
      where: { instanceId },
      orderBy: { billingCycleKey: 'desc' },
      take: limit,
    });
    return records.map(this.mapUsage);
  }

  private mapSubscription(record: any): MerchantSubscriptionDTO {
    return {
      id: record.id,
      instanceId: record.instanceId,
      planType: record.planType as PlanTierType,
      status: record.status as any,
      monthlyQuota: record.monthlyQuota,
      priceMonthly: record.priceMonthly,
      wixPackageId: record.wixPackageId,
      wixSubscriptionId: record.wixSubscriptionId,
      currentPeriodStart: record.currentPeriodStart,
      currentPeriodEnd: record.currentPeriodEnd,
      cancelledAt: record.cancelledAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mapUsage(record: any): MonthlyUsageDTO {
    return {
      id: record.id,
      instanceId: record.instanceId,
      billingCycleKey: record.billingCycleKey,
      labelsGenerated: record.labelsGenerated,
      lastLabelGeneratedAt: record.lastLabelGeneratedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

export const subscriptionRepo = new SubscriptionRepository();
