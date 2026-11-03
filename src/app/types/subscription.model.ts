/**
 * Subscription tiers, models, and quota configurations for EasyPost x Wix App Market Billing.
 */

export type PlanTierType = 'FREE' | 'STARTER' | 'GROWTH' | 'UNLIMITED';
export type SubscriptionStatus = 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'EXPIRED';

export interface PlanTierConfig {
  id: PlanTierType;
  name: string;
  monthlyPriceUSD: number;
  monthlyLabelQuota: number; // -1 represents unlimited
  wixPackageId?: string; // Wix Dev Center App Market Product / Package ID
  yearlyDiscountPercent?: number; // Yearly billing discount percentage
  badgeColor: 'neutral' | 'standard' | 'premium' | 'success';
  description: string;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<PlanTierType, PlanTierConfig> = {
  FREE: {
    id: 'FREE',
    name: 'Basic',
    monthlyPriceUSD: 0.0,
    monthlyLabelQuota: 5,
    wixPackageId: 'basic',
    badgeColor: 'neutral',
    description: 'Free to Install. Perfect for store setup, testing, and trying out EasyPost fulfillment.',
    features: [
      'Up to 5 shipping labels / month',
      'Free to install & test',
      'Live carrier rate calculation (USPS, FedEx, UPS, DHL)',
      'Automated item cartonization',
      'End-of-day SCAN Forms',
      'Standard email support',
    ],
  },
  STARTER: {
    id: 'STARTER',
    name: 'Starter',
    monthlyPriceUSD: 5.0,
    monthlyLabelQuota: 50,
    wixPackageId: 'starter',
    yearlyDiscountPercent: 20,
    badgeColor: 'standard',
    description: 'Designed for small boutique stores shipping 1–2 packages per day. 20% yearly discount.',
    features: [
      'Up to 50 shipping labels / month',
      '20% yearly discount available',
      'Live carrier rate calculation',
      'Automated box packing & presets',
      'End-of-day SCAN Forms',
      'Real-time parcel tracking sync',
      'Priority email support',
    ],
  },
  GROWTH: {
    id: 'GROWTH',
    name: 'Growth',
    monthlyPriceUSD: 10.0,
    monthlyLabelQuota: 100,
    wixPackageId: 'growth',
    yearlyDiscountPercent: 20,
    badgeColor: 'premium',
    description: 'Ideal for established stores scaling fulfillment up to 3–4 orders daily. 20% yearly discount.',
    features: [
      'Up to 100 shipping labels / month',
      '20% yearly discount available',
      'All Starter features included',
      'Automated batch order fulfillment',
      'Direct carrier rate matching',
      'Expedited support response',
    ],
  },
  UNLIMITED: {
    id: 'UNLIMITED',
    name: 'Unlimited',
    monthlyPriceUSD: 20.0,
    monthlyLabelQuota: -1, // Unlimited
    wixPackageId: 'unlimited',
    yearlyDiscountPercent: 10,
    badgeColor: 'success',
    description: 'Uncapped fulfillment volume for high-volume merchants and fulfillment hubs. 10% yearly discount.',
    features: [
      'Unlimited shipping labels every month',
      '10% yearly discount available',
      'Zero quota restrictions or volume caps',
      'Unlimited SCAN Form driver manifests',
      'Priority dispatch queue',
      'VIP 24/7 dedicated support',
    ],
  },
};

export interface MerchantSubscriptionDTO {
  id: string;
  instanceId: string;
  planType: PlanTierType;
  status: SubscriptionStatus;
  monthlyQuota: number;
  priceMonthly: number;
  wixPackageId?: string | null;
  wixSubscriptionId?: string | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonthlyUsageDTO {
  id: string;
  instanceId: string;
  billingCycleKey: string; // e.g. "2026-11"
  labelsGenerated: number;
  lastLabelGeneratedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionUsageLogDTO {
  id: string;
  instanceId: string;
  shipmentId: string;
  trackingCode?: string | null;
  carrier: string;
  service: string;
  rateAmount: number;
  planType: PlanTierType;
  quotaCountAfter: number;
  createdAt: Date;
}

export interface SubscriptionStatusSummary {
  subscription: MerchantSubscriptionDTO;
  planConfig: PlanTierConfig;
  currentUsage: MonthlyUsageDTO;
  remainingLabels: number; // -1 for unlimited
  usagePercentage: number; // 0 to 100
  isExhausted: boolean;
  cycleResetDate: Date;
}

/**
 * Returns formatted billing cycle key (e.g. "2026-11").
 */
export function getBillingCycleKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns the end date of the current calendar month cycle (23:59:59.999 UTC).
 */
export function getCycleEndDate(date: Date = new Date()): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  // Setting day 0 of month + 1 gives the last day of the current month
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
}

/**
 * Maps Wix App Market Package IDs or display names into standard PlanTierType.
 */
export function mapWixPackageToPlanTier(packageIdOrName?: string | null): PlanTierType {
  if (!packageIdOrName) return 'FREE';

  const normalized = packageIdOrName.toLowerCase().trim();

  // 1. Unlimited Tier ($20/mo, Unlimited labels)
  if (normalized.includes('unlimited') || normalized.includes('pkg_unlimited') || normalized === 'unlimited') {
    return 'UNLIMITED';
  }

  // 2. Growth Tier ($10/mo, 100 labels)
  if (
    normalized.includes('growth') ||
    normalized.includes('100') ||
    normalized.includes('pkg_growth') ||
    normalized === 'growth'
  ) {
    return 'GROWTH';
  }

  // 3. Starter Tier ($5/mo, 50 labels)
  if (
    normalized.includes('starter') ||
    normalized.includes('50') ||
    normalized.includes('pkg_starter') ||
    normalized === 'starter'
  ) {
    return 'STARTER';
  }

  // 4. Basic / Free Tier ($0/mo, 5 labels)
  if (
    normalized.includes('basic') ||
    normalized.includes('free') ||
    normalized.includes('pkg_free') ||
    normalized === 'basic'
  ) {
    return 'FREE';
  }

  // Default to Free / Basic
  return 'FREE';
}
