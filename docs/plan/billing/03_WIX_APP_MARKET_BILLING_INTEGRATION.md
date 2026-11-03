# 03. Wix App Market Billing Integration

## 1. Wix Developer Center Pricing Configuration

Configured directly in the **Wix Developers Center &rarr; Pricing & Plans**:

| Name          | Price               | Payment                                 | Product ID  | Show in App Market   | Quota Allowance    |
| :------------ | :------------------ | :-------------------------------------- | :---------- | :------------------- | :----------------- |
| **Starter**   | **$5**              | Recurring payment (20% yearly discount) | `starter`   | Visible (Toggle ON)  | 50 labels / month  |
| **Basic**     | **Free to Install** | -                                       | `basic`     | Visible (Toggle OFF) | 5 labels / month   |
| **Unlimited** | **$20**             | Recurring payment (10% yearly discount) | `unlimited` | Visible (Toggle ON)  | Unlimited labels   |
| **Growth**    | **$10**             | Recurring payment (20% yearly discount) | `growth`    | Visible (Toggle ON)  | 100 labels / month |

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
    packageName?: string; // e.g. "Starter", "Growth", "Unlimited", "Basic"
    vendorProductId?: string; // e.g. "starter", "growth", "unlimited", "basic"
    expirationDate?: string;
    billingCycle?: 'MONTHLY' | 'YEARLY';
  };
}
```

### Plan Sync on Dashboard Access

Whenever the dashboard initializes, `syncBillingFromInstance(decodedInstance)` runs:

1. If `decodedInstance.billing?.vendorProductId` matches a paid tier:
   - Matches `starter` &rarr; Sets tier to `STARTER` (quota: 50).
   - Matches `growth` &rarr; Sets tier to `GROWTH` (quota: 100).
   - Matches `unlimited` &rarr; Sets tier to `UNLIMITED` (quota: -1).
2. If `decodedInstance.billing` is missing, expired, or matches `basic` &rarr; Defaults to `FREE` (quota: 5).

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
