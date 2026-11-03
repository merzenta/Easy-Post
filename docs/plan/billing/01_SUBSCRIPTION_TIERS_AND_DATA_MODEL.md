# 01. Subscription Tiers & Data Model

## 1. Tier Definitions & Quota Matrix

```typescript
export type PlanTierType = 'FREE' | 'STARTER' | 'GROWTH' | 'UNLIMITED';

export interface PlanTierConfig {
  id: PlanTierType;
  name: string;
  monthlyPriceUSD: number;
  monthlyLabelQuota: number; // -1 represents unlimited
  wixPackageId?: string; // Wix Dev Center App Market Package ID
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<PlanTierType, PlanTierConfig> = {
  FREE: {
    id: 'FREE',
    name: 'Basic',
    monthlyPriceUSD: 0.0,
    monthlyLabelQuota: 5,
    wixPackageId: 'basic',
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
    features: [
      'Up to 50 shipping labels / month',
      '20% discount on yearly billing',
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
    features: [
      'Up to 100 shipping labels / month',
      '20% discount on yearly billing',
      'All Starter features included',
      'Batch order fulfillment',
      'Automated Wix tracking link updates',
      'Expedited support',
    ],
  },
  UNLIMITED: {
    id: 'UNLIMITED',
    name: 'Unlimited',
    monthlyPriceUSD: 20.0,
    monthlyLabelQuota: -1, // Unlimited
    wixPackageId: 'unlimited',
    features: [
      'Unlimited shipping labels every month',
      '10% discount on yearly billing',
      'Zero volume restrictions',
      'Unlimited SCAN Form manifests',
      'Dedicated carrier dispatch optimization',
      'VIP priority 24/7 support',
    ],
  },
};
```

---

## 2. PostgreSQL Prisma Schema Extensions

Add the following three models to `prisma/schema.prisma`:

```prisma
// -------------------------------------------------------------
// 4. Merchant Subscription & Billing State
// -------------------------------------------------------------
model MerchantSubscription {
  id                 String    @id @default(uuid())
  instanceId         String    @unique @map("instance_id")
  planType           String    @default("FREE") @map("plan_type") // FREE, STARTER, GROWTH, UNLIMITED
  status             String    @default("ACTIVE") @map("status")   // ACTIVE, CANCELLED, PAST_DUE, EXPIRED
  monthlyQuota       Int       @default(5) @map("monthly_quota")   // 5, 50, 100, -1 (unlimited)
  priceMonthly       Float     @default(0.0) @map("price_monthly")

  wixPackageId       String?   @map("wix_package_id")
  wixSubscriptionId  String?   @map("wix_subscription_id")

  currentPeriodStart DateTime  @default(now()) @map("current_period_start")
  currentPeriodEnd   DateTime  @map("current_period_end")
  cancelledAt        DateTime? @map("cancelled_at")

  createdAt          DateTime  @default(now()) @map("created_at")
  updatedAt          DateTime  @updatedAt @map("updated_at")

  usageRecords       MonthlyUsage[]
  usageLogs          SubscriptionUsageLog[]

  @@index([instanceId, status])
  @@map("merchant_subscriptions")
}

// -------------------------------------------------------------
// 5. Monthly Quota Usage Aggregation
// -------------------------------------------------------------
model MonthlyUsage {
  id                    String                @id @default(uuid())
  instanceId            String                @map("instance_id")
  billingCycleKey       String                @map("billing_cycle_key") // e.g. "2026-11"
  labelsGenerated       Int                   @default(0) @map("labels_generated")
  lastLabelGeneratedAt  DateTime?             @map("last_label_generated_at")

  subscriptionId        String?               @map("subscription_id")
  subscription          MerchantSubscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)

  createdAt             DateTime              @default(now()) @map("created_at")
  updatedAt             DateTime              @updatedAt @map("updated_at")

  @@unique([instanceId, billingCycleKey])
  @@index([instanceId, billingCycleKey])
  @@map("monthly_usages")
}

// -------------------------------------------------------------
// 6. Immutable Label Purchase Audit Trail
// -------------------------------------------------------------
model SubscriptionUsageLog {
  id                 String                @id @default(uuid())
  instanceId         String                @map("instance_id")
  shipmentId         String                @map("shipment_id")
  trackingCode       String?               @map("tracking_code")
  carrier            String                @map("carrier")
  service            String                @map("service")
  rateAmount         Float                 @default(0.0) @map("rate_amount")

  planType           String                @map("plan_type")
  quotaCountAfter    Int                   @map("quota_count_after")

  subscriptionId     String?               @map("subscription_id")
  subscription       MerchantSubscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)

  createdAt          DateTime              @default(now()) @map("created_at")

  @@index([instanceId, createdAt])
  @@index([shipmentId])
  @@map("subscription_usage_logs")
}
```

---

## 3. Tenant Initialization Lifecycle

When a merchant installs the app or connects for the first time:

1. `getOrCreateSubscription(instanceId)` checks if a record exists in `merchant_subscriptions`.
2. If none exists, an active **`FREE`** plan record is automatically created:
   - `planType: 'FREE'`
   - `monthlyQuota: 5`
   - `priceMonthly: 0.0`
   - `status: 'ACTIVE'`
   - `currentPeriodStart`: Today at 00:00:00 UTC
   - `currentPeriodEnd`: 1st day of next calendar month (or +30 days)
3. Corresponding `monthly_usages` row for the current cycle (e.g. `2026-11`) is initialized with `labelsGenerated: 0`.
