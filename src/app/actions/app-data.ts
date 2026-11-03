'use server';

import {
  MerchantSettings,
  ShippingAppData,
  ShippingMethodType,
  ShippingUnitOfMeasure,
} from '@/app/types/app-data.model';
import { parseAccessToken } from '@/app/actions/app-instance';
import { isTestingToken } from '@/app/utils/access-token';
import { merchantSettingsRepo } from '@/app/repositories';
import { createEasyPostClient } from '@/app/utils/easypost-client';
import { createTenantLogger } from '@/app/utils/logger';

export type AppIdentifier = { instanceId?: string; accessToken?: string };

export const resolveInstanceId = async (appIdentifier: AppIdentifier): Promise<string> => {
  let instanceId = appIdentifier.instanceId;
  if (!instanceId) {
    if (!appIdentifier.accessToken) {
      throw new Error('app-data:appIdentifier - instanceId or accessToken is required');
    }
    const appInstance = await parseAccessToken(appIdentifier.accessToken);
    instanceId = appInstance.instance?.instanceId;
  }
  if (!instanceId) {
    throw new Error('app-data: Failed to resolve instanceId from provided token');
  }
  return instanceId;
};

export const resolveInstanceWithBilling = async (
  appIdentifier: AppIdentifier,
): Promise<{ instanceId: string; billing?: any }> => {
  let instanceId = appIdentifier.instanceId;
  let billing: any = undefined;

  if (appIdentifier.accessToken) {
    try {
      const appInstance = await parseAccessToken(appIdentifier.accessToken);
      instanceId = instanceId || appInstance?.instance?.instanceId || appInstance?.instanceId;
      billing = appInstance?.instance?.billing || appInstance?.billing;
    } catch {
      // Ignore token parsing error if fallback instanceId is available
    }
  }

  if (!instanceId) {
    throw new Error('app-data: Failed to resolve instanceId from provided token');
  }

  return { instanceId, billing };
};

/**
 * Converts MerchantSettings into the legacy ShippingAppData structure
 * so legacy dashboard forms and tests continue functioning seamlessly.
 */
function settingsToShippingAppData(settings: MerchantSettings): ShippingAppData {
  const isUspsEnabled = settings.enabledCarriers.includes('USPS');
  const isExpressEnabled = settings.enabledCarriers.includes('FedEx') || settings.enabledCarriers.includes('UPS');

  return {
    shippingMethods: [
      {
        code: 'easypost-usps',
        title: 'USPS Priority Mail',
        type: ShippingMethodType.STANDARD,
        unitOfMeasure: ShippingUnitOfMeasure.NUM_OF_ITEMS,
        logistics: {
          deliveryTime: '2-5 business days',
        },
        costs: {
          first: isUspsEnabled ? settings.fallbackRate : 0,
          second: 2,
          thirdAndUp: 1,
        },
      },
      {
        code: 'easypost-express',
        title: 'Express Overnight',
        type: ShippingMethodType.EXPRESS,
        unitOfMeasure: ShippingUnitOfMeasure.NUM_OF_ITEMS,
        logistics: {
          deliveryTime: '1-2 business days',
        },
        costs: {
          first: isExpressEnabled ? settings.fallbackRate + 15 : 0,
          second: 5,
          thirdAndUp: 3,
        },
      },
    ],
  };
}

/**
 * Fetches merchant configuration and converts to ShippingAppData.
 */
export async function getShippingAppData(appIdentifier: AppIdentifier): Promise<ShippingAppData> {
  try {
    if (isTestingToken(appIdentifier?.accessToken)) {
      return (await import('@/app/utils/mocks-server')).getTestingShippingAppData();
    }
    const instanceId = await resolveInstanceId(appIdentifier);
    const settings = await merchantSettingsRepo.getSettings(instanceId);
    if (!settings) {
      throw new Error(`No settings found for instanceId: ${instanceId}`);
    }
    return settingsToShippingAppData(settings);
  } catch (e) {
    console.error('getShippingAppData::error - ', e);
    return {
      shippingMethods: [
        {
          code: 'easypost-standard',
          title: 'Standard Shipping',
          type: ShippingMethodType.STANDARD,
          unitOfMeasure: ShippingUnitOfMeasure.NUM_OF_ITEMS,
          costs: { first: 10, second: 2, thirdAndUp: 1 },
        },
      ],
    };
  }
}

/**
 * Updates legacy shipping app data.
 */
export async function setShippingAppData(appData: ShippingAppData, appIdentifier: AppIdentifier): Promise<void> {
  try {
    if (isTestingToken(appIdentifier?.accessToken)) {
      return;
    }
    const instanceId = await resolveInstanceId(appIdentifier);
    const standardMethod = appData.shippingMethods.find((m) => m.type === ShippingMethodType.STANDARD);
    const firstCost = standardMethod?.costs.first ?? 10.0;

    await merchantSettingsRepo.saveSettings(instanceId, {
      fallbackRate: firstCost,
    });
  } catch (e) {
    console.error('setShippingAppData::error - ', e);
    throw e;
  }
}

/**
 * Get comprehensive EasyPost merchant settings.
 */
export async function getMerchantSettingsAction(appIdentifier: AppIdentifier): Promise<MerchantSettings> {
  const instanceId = await resolveInstanceId(appIdentifier);
  const settings = await merchantSettingsRepo.getSettings(instanceId);
  if (!settings) {
    throw new Error(`Settings not found for tenant: ${instanceId}`);
  }
  return settings;
}

/**
 * Update comprehensive EasyPost merchant settings.
 */
export async function saveMerchantSettingsAction(
  settings: Partial<MerchantSettings>,
  appIdentifier: AppIdentifier,
): Promise<MerchantSettings> {
  const instanceId = await resolveInstanceId(appIdentifier);
  const logger = createTenantLogger(instanceId, undefined, undefined, 'actions/saveMerchantSettings');

  logger.info('SAVING_SETTINGS', 'Updating EasyPost merchant configuration', {
    environment: settings.environment,
    labelFormat: settings.defaultLabelFormat,
    enabledCarriers: settings.enabledCarriers,
  });

  return await merchantSettingsRepo.saveSettings(instanceId, settings);
}

/**
 * Validates EasyPost API Key.
 */
export async function validateEasyPostCredentialsAction(
  apiKey: string,
  appIdentifier: AppIdentifier,
): Promise<{ valid: boolean; user?: string; error?: string }> {
  try {
    const client = createEasyPostClient(apiKey);
    return await client.validateApiKey();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, error: message };
  }
}
