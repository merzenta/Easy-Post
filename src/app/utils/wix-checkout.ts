/**
 * Utility for opening Wix App Market hosted billing checkout and subscription management.
 */
export function getWixUpgradeCheckoutUrl(packageId?: string): string {
  const appDefId = process.env.NEXT_PUBLIC_WIX_APP_ID || '4bf163d4-50ce-46f8-8e30-9ac3766e312f';
  if (packageId) {
    return `https://www.wix.com/app-market/checkout?appDefinitionId=${appDefId}&packageId=${packageId}`;
  }
  return `https://www.wix.com/app-market/checkout?appDefinitionId=${appDefId}`;
}

export function openWixUpgradeCheckout(packageId?: string): void {
  if (typeof window === 'undefined') return;
  const url = getWixUpgradeCheckoutUrl(packageId);
  window.open(url, '_blank');
}

export function openWixSubscriptionManagement(): void {
  if (typeof window === 'undefined') return;
  window.open('https://manage.wix.com/account/billing', '_blank');
}
