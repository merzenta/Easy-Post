'use server';

import { merchantSettingsRepo, scanFormRepo, shipmentRepo } from '@/app/repositories';
import { createEasyPostClient } from '@/app/utils/easypost-client';
import { EasyPostScanForm } from '@/app/types/easypost.model';
import { AppIdentifier, resolveInstanceId } from '@/app/actions/app-data';
import { createTenantLogger } from '@/app/utils/logger';

/**
 * Creates an EasyPost End-of-Day SCAN Form for driver pickup.
 */
export async function createScanFormManifestAction(
  shipmentIds: string[],
  appIdentifier: AppIdentifier,
): Promise<EasyPostScanForm> {
  const instanceId = await resolveInstanceId(appIdentifier);
  const logger = createTenantLogger(instanceId, undefined, undefined, 'actions/createScanForm');

  if (!shipmentIds || shipmentIds.length === 0) {
    throw new Error('At least one shipment ID is required to generate a SCAN form');
  }

  const settings = await merchantSettingsRepo.getSettings(instanceId);
  if (!settings || !settings.apiKey) {
    throw new Error(`EasyPost API key not configured for store instance ${instanceId}`);
  }

  const client = createEasyPostClient(settings.apiKey);

  // Load the target shipments
  const shipments = await Promise.all(shipmentIds.map((id) => shipmentRepo.getShipmentById(instanceId, id)));

  const validShipments = shipments.filter((s) => Boolean(s && s.status === 'LABEL_PURCHASED'));
  if (validShipments.length === 0) {
    throw new Error('No valid purchased shipments found to manifest');
  }

  const epShipmentIds = validShipments.map((s) => s!.easypost_shipment_id);

  logger.info('CREATING_SCAN_FORM', 'Calling EasyPost to create SCAN Form manifest', {
    shipmentCount: epShipmentIds.length,
  });

  const scanFormResult = await client.createScanForm(epShipmentIds);

  const internalId = `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const newScanForm: EasyPostScanForm = {
    id: internalId,
    instance_id: instanceId,
    easypost_scan_form_id: scanFormResult.id,
    status: scanFormResult.status,
    form_url: scanFormResult.formUrl,
    form_file_type: 'PDF',
    shipment_count: validShipments.length,
    tracking_codes: scanFormResult.trackingCodes,
    batch_id: scanFormResult.batchId,
    message: scanFormResult.message,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const saved = await scanFormRepo.saveScanForm(newScanForm);

  // Update manifested status on shipments
  for (const ship of validShipments) {
    if (ship) {
      await shipmentRepo.updateShipmentStatus(instanceId, ship.id, 'MANIFESTED', {
        scan_form_id: saved.easypost_scan_form_id,
      });
    }
  }

  logger.info('SCAN_FORM_CREATED', 'Successfully generated EasyPost SCAN Form', {
    scanFormId: saved.id,
    easypostScanFormId: saved.easypost_scan_form_id,
    formUrl: saved.form_url,
  });

  return saved;
}

/**
 * Lists all SCAN forms generated for the store instance.
 */
export async function listScanFormsAction(appIdentifier: AppIdentifier, limit?: number): Promise<EasyPostScanForm[]> {
  const instanceId = await resolveInstanceId(appIdentifier);
  return await scanFormRepo.listScanForms(instanceId, limit);
}

/**
 * Retrieves a specific SCAN form by ID.
 */
export async function getScanFormAction(
  scanFormId: string,
  appIdentifier: AppIdentifier,
): Promise<EasyPostScanForm | null> {
  const instanceId = await resolveInstanceId(appIdentifier);
  return await scanFormRepo.getScanFormById(instanceId, scanFormId);
}
