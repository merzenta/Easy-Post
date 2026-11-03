# 04. Billing Dashboard & Upgrade UI

## 1. UI Components Overview

The billing user experience consists of two components:

1. **"Plans & Billing" Dashboard Tab (`BillingTab.tsx`)**: Provides full visibility into the merchant's current plan, monthly quota consumption, renewal dates, and upgrade options.
2. **Quota Exceeded Upgrade Modal (`QuotaExceededUpgradeModal.tsx`)**: An in-flow modal that pops up whenever a merchant tries to buy a label after exhausting their monthly allowance.

---

## 2. "Plans & Billing" Tab (`BillingTab.tsx`)

### Layout Wireframe & Structure:

```
+-----------------------------------------------------------------------------------------+
| Plans & Billing                                                                         |
| Manage your app subscription, monitor label generation quota, and upgrade plans.        |
+-----------------------------------------------------------------------------------------+
| CURRENT PLAN & USAGE                                                                    |
|                                                                                         |
|  Active Plan: Basic [ACTIVE]                             Cycle Resets: Dec 1, 2026      |
|                                                                                         |
|  Monthly Label Usage: 4 of 5 labels generated (80% used)                                |
|  [========================================================-------------]                |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
| AVAILABLE SUBSCRIPTION PLANS                                                            |
|                                                                                         |
|  +-------------------+  +-------------------+  +-------------------+  +---------------+ |
|  | BASIC (Free)      |  | STARTER           |  | GROWTH            |  | UNLIMITED     | |
|  | Free to Install   |  | $5 / month        |  | $10 / month       |  | $20 / month   | |
|  | (Product: basic)  |  | (20% yr discount) |  | (20% yr discount) |  | (10% yr disc) | |
|  |                   |  | (Product: starter)|  | (Product: growth) |  | (unlimited)   | |
|  | * 5 Labels / mo   |  | * 50 Labels / mo  |  | * 100 Labels / mo |  | * Unlimited   | |
|  | * Live Rates      |  | * Box Packer      |  | * Priority Sync   |  | * No Limits   | |
|  | * SCAN Forms      |  | * Tracking Sync   |  | * Batch Orders    |  | * VIP Support | |
|  |                   |  |                   |  |                   |  |               | |
|  | [ Active Plan ]   |  | [Upgrade ($5/mo)] |  | [Upgrade ($10/mo)]|  | [Go Unlimited]| |
|  +-------------------+  +-------------------+  +-------------------+  +---------------+ |
+-----------------------------------------------------------------------------------------+
```

### Component Implementation Details:

- **Usage Meter**: Visual bar rendering current usage vs quota. Dynamically colors:
  - Green (`< 75%`)
  - Warning Orange (`75% - 99%`)
  - Danger Red (`100% - Quota Exhausted`)
- **Plan Cards**: 4-column responsive grid comparing Free, $5, $10, and $20 tiers.
  - Active plan has a highlighted border (`#0055ff`) and a `Current Plan` disabled button.
  - Higher tiers have primary action buttons that open the Wix App Market checkout window.

---

## 3. In-Flow Quota Exceeded Modal (`QuotaExceededUpgradeModal.tsx`)

When a merchant exhausts their quota and clicks "Buy Label" in `ShipmentPreparationModal` or `OrdersTab`:

```typescript
export interface QuotaExceededUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: {
    planType: string;
    monthlyQuota: number;
    labelsGenerated: number;
    resetDate: string;
  };
}
```

### Modal Features:

1. **Title**: `Monthly Label Limit Reached`
2. **Contextual Messaging**:
   _"You have reached your limit of 5 shipping labels for the Free Plan this month. Your quota will automatically reset on Dec 1, 2026."_
3. **Upgrade Value Proposition**:
   _"Upgrade to the **Starter Plan ($5/month)** to unlock 50 shipping labels immediately, or **Unlimited ($20/month)** for unrestricted fulfillment."_
4. **Action Buttons**:
   - Primary: `Upgrade to Starter ($5/mo)` &rarr; opens Wix App Market Checkout.
   - Secondary: `Upgrade to Unlimited ($20/mo)`.
   - Tertiary: `Cancel / Wait for Reset`.
