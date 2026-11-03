'use server';

import { merchantSettingsRepo, trackingRepo } from '@/app/repositories';
import { createEasyPostClient } from '@/app/utils/easypost-client';
import { EasyPostTrackingRecord } from '@/app/types/easypost.model';
import { AppIdentifier, resolveInstanceId } from '@/app/actions/app-data';
import { createTenantLogger } from '@/app/utils/logger';

/**
 * Tracks a package with EasyPost by querying or creating a tracker.
 */
export async function trackShipmentAction(
  trackingCode: string,
  carrier: string | undefined,
  appIdentifier: AppIdentifier,
): Promise<EasyPostTrackingRecord> {
  const instanceId = await resolveInstanceId(appIdentifier);
  const logger = createTenantLogger(instanceId, undefined, undefined, 'actions/trackShipment');

  const settings = await merchantSettingsRepo.getSettings(instanceId);
  if (!settings || !settings.apiKey) {
    throw new Error(`EasyPost API key not configured for store instance ${instanceId}`);
  }

  const client = createEasyPostClient(settings.apiKey);

  logger.info('TRACKING_QUERY', 'Fetching tracker update from EasyPost', {
    trackingCode,
    carrier,
  });

  const trackerData = await client.trackPackage(trackingCode, carrier);

  const internalId = `trk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const record: EasyPostTrackingRecord = {
    id: internalId,
    instance_id: instanceId,
    tracking_code: trackingCode,
    easypost_tracker_id: trackerData.easypost_tracker_id,
    carrier: trackerData.carrier || carrier || 'USPS',
    status: trackerData.status || 'unknown',
    status_detail: trackerData.status_detail,
    public_url: trackerData.public_url,
    est_delivery_date: trackerData.est_delivery_date,
    events: trackerData.events || [],
    is_delivered: trackerData.is_delivered ?? false,
    has_exception: trackerData.has_exception ?? false,
    last_checked_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const saved = await trackingRepo.saveTrackingRecord(record);
  logger.info('TRACKING_SAVED', 'Tracking record persisted', {
    trackingCode,
    status: saved.status,
    eventsCount: saved.events.length,
  });

  return saved;
}

/**
 * Lists all tracked records for the tenant.
 */
export async function listTrackingRecordsAction(
  appIdentifier: AppIdentifier,
  filter?: { hasException?: boolean; isDelivered?: boolean },
): Promise<EasyPostTrackingRecord[]> {
  const instanceId = await resolveInstanceId(appIdentifier);
  return await trackingRepo.listTrackingRecords(instanceId, filter);
}

/**
 * Retrieves a tracking record from local store.
 */
export async function getTrackingRecordAction(
  trackingCode: string,
  appIdentifier: AppIdentifier,
): Promise<EasyPostTrackingRecord | null> {
  const instanceId = await resolveInstanceId(appIdentifier);
  return await trackingRepo.getTrackingRecord(instanceId, trackingCode);
}
