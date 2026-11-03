'use server';

import { merchantSettingsRepo, shipmentRepo } from '@/app/repositories';
import { createEasyPostClient } from '@/app/utils/easypost-client';
import { EasyPostShipment } from '@/app/types/easypost.model';
import { AppIdentifier, resolveInstanceId } from '@/app/actions/app-data';
import { createTenantLogger } from '@/app/utils/logger';
import { syncOrderFulfillmentAction } from './easypost-shipments';

/**
 * Purchases a postage label for an EasyPost shipment using the specified rate ID.
 */
export async function buyShipmentLabelAction(
  shipmentId: string,
  rateId: string,
  appIdentifier: AppIdentifier,
  insuranceAmount?: number,
): Promise<EasyPostShipment> {
  const instanceId = await resolveInstanceId(appIdentifier);
  const logger = createTenantLogger(instanceId, undefined, undefined, 'actions/buyLabel');

  const shipment = await shipmentRepo.getShipmentById(instanceId, shipmentId);
  if (!shipment) {
    throw new Error(`Shipment ${shipmentId} not found`);
  }

  const settings = await merchantSettingsRepo.getSettings(instanceId);
  if (!settings || !settings.apiKey) {
    throw new Error(`EasyPost API key not configured for store instance ${instanceId}`);
  }

  const client = createEasyPostClient(settings.apiKey);

  logger.info('BUYING_LABEL', 'Submitting postage label purchase to EasyPost', {
    shipmentId,
    easypostShipmentId: shipment.easypost_shipment_id,
    rateId,
  });

  const bought = await client.buyShipment(shipment.easypost_shipment_id, rateId, insuranceAmount);

  const updated = await shipmentRepo.updateShipmentStatus(instanceId, shipmentId, 'LABEL_PURCHASED', {
    tracking_code: bought.trackingCode,
    tracker_id: bought.trackerId,
    label_url: bought.labelUrl,
    rate_id: bought.rateId,
    rate_amount: bought.rateAmount,
    rate_currency: bought.rateCurrency,
    carrier: bought.carrier || shipment.carrier,
    service: bought.service || shipment.service,
  });

  if (!updated) {
    throw new Error(`Failed to update shipment status for ${shipmentId}`);
  }

  // Auto-sync fulfillment to Wix
  if (updated.wix_order_id && updated.tracking_code) {
    try {
      const syncRes = await syncOrderFulfillmentAction(
        {
          orderId: updated.wix_order_id,
          shipmentId: updated.id,
          lineItems: (updated.items || []).map((i) => ({ id: i.item_id, quantity: i.quantity })),
        },
        appIdentifier,
      );
      if (!syncRes.success) {
        logger.warn('AUTO_FULFILLMENT_FAILED', 'Could not auto-fulfill order on label buy', {
          error: syncRes.error,
        });
      }
    } catch (fulfillErr) {
      logger.warn('AUTO_FULFILLMENT_FAILED', 'Could not auto-fulfill order on label buy', {
        error: fulfillErr instanceof Error ? fulfillErr.message : String(fulfillErr),
      });
    }
  }

  return updated;
}

/**
 * Retrieves the label URL for a purchased shipment.
 */
export async function getLabelUrlAction(
  shipmentId: string,
  appIdentifier: AppIdentifier,
): Promise<{ labelUrl: string; labelFormat: string }> {
  const instanceId = await resolveInstanceId(appIdentifier);
  const shipment = await shipmentRepo.getShipmentById(instanceId, shipmentId);
  if (!shipment || !shipment.label_url) {
    throw new Error(`No label URL available for shipment ${shipmentId}`);
  }

  return {
    labelUrl: shipment.label_url,
    labelFormat: shipment.label_format || 'PDF',
  };
}
