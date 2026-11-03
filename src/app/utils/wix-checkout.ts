/**
 * Utility for opening Wix App Market hosted billing checkout and subscription management.
 */

export interface WixUpgradeCheckoutOptions {
  instanceId?: string;
  packageId?: string;
  appId?: string;
}

/**
 * Extracts the Wix instanceId from the browser query params if inside a Wix dashboard iframe.
 */
export function getClientAppInstanceId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const params = new URLSearchParams(window.location.search);
    const directInstanceId = params.get('appInstanceId') || params.get('instanceId');
    if (directInstanceId) return directInstanceId;

    // In Wix dashboard iframes, 'instance' query parameter is a signed token: <signature>.<payload_base64>
    const instanceToken = params.get('instance');
    if (instanceToken && instanceToken.includes('.')) {
      const parts = instanceToken.split('.');
      if (parts[1]) {
        const decoded = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (decoded?.instanceId) return decoded.instanceId;
      }
    }
  } catch {
    // Non-fatal, fallback to empty
  }
  return undefined;
}

/**
 * Generates the Wix upgrade URL: https://www.wix.com/apps/upgrade/<APP_ID>?appInstanceId=<INSTANCE_ID>
 */
export function getWixUpgradeCheckoutUrl(
  instanceIdOrPackageIdOrOptions?: string | WixUpgradeCheckoutOptions,
  maybePackageId?: string,
): string {
  const appId = process.env.NEXT_PUBLIC_WIX_APP_ID || '4bf163d4-50ce-46f8-8e30-9ac3766e312f';
  let instanceId: string | undefined;
  let packageId: string | undefined;

  if (typeof instanceIdOrPackageIdOrOptions === 'object' && instanceIdOrPackageIdOrOptions !== null) {
    instanceId = instanceIdOrPackageIdOrOptions.instanceId;
    packageId = instanceIdOrPackageIdOrOptions.packageId;
  } else if (typeof instanceIdOrPackageIdOrOptions === 'string') {
    if (maybePackageId) {
      instanceId = instanceIdOrPackageIdOrOptions;
      packageId = maybePackageId;
    } else {
      // Single string argument: check if it matches a known package or instanceId
      const knownPackages = ['starter', 'growth', 'unlimited', 'basic'];
      if (
        knownPackages.includes(instanceIdOrPackageIdOrOptions.toLowerCase()) ||
        instanceIdOrPackageIdOrOptions.startsWith('pkg_')
      ) {
        packageId = instanceIdOrPackageIdOrOptions;
      } else {
        instanceId = instanceIdOrPackageIdOrOptions;
      }
    }
  }

  // Fallback to client iframe search parameters if instanceId wasn't explicitly provided
  if (!instanceId) {
    instanceId = getClientAppInstanceId();
  }

  const url = `https://www.wix.com/apps/upgrade/${appId}`;
  const params = new URLSearchParams();
  if (instanceId) {
    params.set('appInstanceId', instanceId);
  }
  if (packageId) {
    params.set('packageId', packageId);
  }

  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

export function openWixUpgradeCheckout(
  instanceIdOrPackageIdOrOptions?: string | WixUpgradeCheckoutOptions,
  maybePackageId?: string,
): void {
  if (typeof window === 'undefined') return;
  const url = getWixUpgradeCheckoutUrl(instanceIdOrPackageIdOrOptions, maybePackageId);
  window.open(url, '_blank');
}

export function openWixSubscriptionManagement(): void {
  if (typeof window === 'undefined') return;
  window.open('https://manage.wix.com/account/billing', '_blank');
}
