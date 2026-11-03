# 03. Wix App Market Billing Integration

## 1. Wix Developer Center Pricing Configuration

To monetize the application on Wix, configure the 4 pricing tiers in the **Wix Developers Center &rarr; Pricing & Plans**:

| Package ID (Dev Center) | Display Name | Billing Frequency | Price (USD) | Quota Metadata |
| :--- | :--- | :--- | :--- | :--- |
| `pkg_free_trial` | **Free Plan** | Monthly | $0.00 / mo | 5 labels / month |
| `pkg_starter_50_labels` | **Starter Plan** | Monthly | $5.00 / mo | 50 labels / month |
| `pkg_growth_100_labels` | **Growth Plan** | Monthly | $10.00 / mo | 100 labels / month |
| `pkg_unlimited_labels` | **Unlimited Plan** | Monthly | $20.00 / mo | Unlimited labels |

---

## 2. Reading Billing Information from Wix Signed Instance

When an admin opens the app in the Wix Dashboard, Wix sends a signed `instance` query parameter. Once verified using the App Secret Key, the payload contains the active subscription:

```typescript
export interface WixDecodedInstance {
  instanceId: string;
  appDefId: string;
  signDate: string;
  uid?: string;
  permissions?: string;
  billing?: {
    packageName?: string;         // e.g. "Starter Plan", "Growth Plan", "Unlimited Plan"
    vendorProductId?: string;     // e.g. "pkg_starter_50_labels"
    expirationDate?: string;
    billingCycle?: 'MONTHLY' | 'YEARLY';
  };
}
```

### Plan Sync on Dashboard Access

Whenever the dashboard initializes, `syncBillingFromInstance(decodedInstance)` runs:
1. If `decodedInstance.billing?.vendorProductId` matches a paid tier:
   - Matches `pkg_starter_50_labels` &rarr; Sets tier to `STARTER` (quota: 50).
   - Matches `pkg_growth_100_labels` &rarr; Sets tier to `GROWTH` (quota: 100).
   - Matches `pkg_unlimited_labels` &rarr; Sets tier to `UNLIMITED` (quota: -1).
2. If `decodedInstance.billing` is missing or expired &rarr; Defaults to `FREE` (quota: 5).

---

## 3. Wix App Market Webhooks (`/api/webhooks/v1/billing`)

Wix broadcasts webhook events when merchants subscribe, upgrade, or cancel their plans.

### Webhook Route Handler:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyWixWebhookSignature } from '@/app/utils/jwt-verify';
import { handleWixBillingEvent } from '@/app/actions/billing.action';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-wix-signature') || '';

    // 1. Verify Wix Cryptographic Signature
    const isValid = verifyWixWebhookSignature(rawBody, signature, process.env.WIX_APP_SECRET!);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const event = JSON.parse(rawBody);

    // 2. Dispatch event
    switch (event.eventType) {
      case 'PAID_PLAN_PURCHASED':
      case 'PAID_PLAN_CHANGED':
        await handleWixBillingEvent({
          instanceId: event.instanceId,
          packageId: event.data.vendorProductId,
          subscriptionId: event.data.subscriptionId,
          action: 'UPGRADE',
        });
        break;

      case 'PAID_PLAN_CANCELLED':
        await handleWixBillingEvent({
          instanceId: event.instanceId,
          packageId: event.data.vendorProductId,
          subscriptionId: event.data.subscriptionId,
          action: 'CANCEL',
        });
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

## 4. Merchant Upgrade Checkout Flow

When a merchant clicks **"Upgrade Plan"** or exceeds their 5 labels on Free tier:
1. The client invokes:
   ```typescript
   export function openWixUpgradeCheckout(packageId: string) {
     const appDefId = process.env.NEXT_PUBLIC_WIX_APP_ID;
     const checkoutUrl = `https://www.wix.com/app-market/checkout?appDefinitionId=${appDefId}&packageId=${packageId}`;
     window.open(checkoutUrl, '_blank');
   }
   ```
2. The merchant completes payment via Wix App Market's secure hosted billing.
3. Wix issues the `PAID_PLAN_PURCHASED` webhook.
4. The merchant's quota immediately updates, unlocking label creation.

