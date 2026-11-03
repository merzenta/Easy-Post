import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { encryptCredential } from '../src/app/utils/crypto';

const prisma = new PrismaClient();
const STORAGE_DIR = process.env.DATA_STORAGE_DIR || path.join(process.cwd(), '.storage');
const isDryRun = process.argv.includes('--dry-run');

interface TenantStorageData {
  settings?: any;
  shipments?: Record<string, any>;
  scanForms?: Record<string, any>;
  tracking?: Record<string, any>;
}

async function migrateTenantFile(filePath: string) {
  const fileName = path.basename(filePath);
  console.log(`\n======================================================`);
  console.log(`Processing file: ${fileName}`);
  console.log(`======================================================`);

  const raw = fs.readFileSync(filePath, 'utf8');
  let data: TenantStorageData;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse JSON in ${fileName}:`, err);
    return;
  }

  // 1. Settings Migration
  if (data.settings && data.settings.instanceId) {
    const s = data.settings;
    console.log(`[MerchantSettings] Migrating instance ${s.instanceId}...`);

    if (!isDryRun) {
      await prisma.merchantSettings.upsert({
        where: { instanceId: s.instanceId },
        create: {
          instanceId: s.instanceId,
          environment: s.environment || 'TEST',
          apiKeyEncrypted: s.apiKey ? encryptCredential(s.apiKey) : '',
          webhookSecret: s.webhookSecret ? encryptCredential(s.webhookSecret) : null,
          defaultLabelFormat: s.defaultLabelFormat || 'PDF',
          merchantLocation: s.merchantLocation || {},
          packagePresets: s.packagePresets || [],
          enabledCarriers: s.enabledCarriers || ['USPS', 'FedEx', 'UPS', 'DHL'],
          carrierAccounts: s.carrierAccounts || [],
          handlingFeeType: s.handlingFeeType || 'NONE',
          handlingFeeValue: s.handlingFeeValue ?? 0.0,
          freeShippingThreshold: s.freeShippingThreshold ?? null,
          fallbackRate: s.fallbackRate ?? 10.0,
          defaultItemWeightOz: s.defaultItemWeightOz ?? 16.0,
          createdAt: s.createdAt ? new Date(s.createdAt) : new Date(),
          updatedAt: s.updatedAt ? new Date(s.updatedAt) : new Date(),
        },
        update: {
          environment: s.environment || 'TEST',
          apiKeyEncrypted: s.apiKey ? encryptCredential(s.apiKey) : '',
          webhookSecret: s.webhookSecret ? encryptCredential(s.webhookSecret) : null,
          defaultLabelFormat: s.defaultLabelFormat || 'PDF',
          merchantLocation: s.merchantLocation || {},
          packagePresets: s.packagePresets || [],
          enabledCarriers: s.enabledCarriers || ['USPS', 'FedEx', 'UPS', 'DHL'],
          carrierAccounts: s.carrierAccounts || [],
          handlingFeeType: s.handlingFeeType || 'NONE',
          handlingFeeValue: s.handlingFeeValue ?? 0.0,
          freeShippingThreshold: s.freeShippingThreshold ?? null,
          fallbackRate: s.fallbackRate ?? 10.0,
          defaultItemWeightOz: s.defaultItemWeightOz ?? 16.0,
          updatedAt: new Date(),
        },
      });
    }
  }

  // 2. SCAN Forms Migration
  if (data.scanForms) {
    for (const [id, sf] of Object.entries(data.scanForms)) {
      if (!isDryRun) {
        await prisma.scanFormOrder.upsert({
          where: { easypostScanFormId: sf.easypost_scan_form_id || id },
          create: {
            id: sf.id || id,
            instanceId: sf.instance_id,
            easypostScanFormId: sf.easypost_scan_form_id || id,
            status: sf.status || 'created',
            formUrl: sf.form_url,
            formFileType: sf.form_file_type || 'PDF',
            shipmentCount: sf.shipment_count || 0,
            trackingCodes: sf.tracking_codes || [],
            batchId: sf.batch_id,
            message: sf.message,
            createdAt: sf.created_at ? new Date(sf.created_at) : new Date(),
            updatedAt: sf.updated_at ? new Date(sf.updated_at) : new Date(),
          },
          update: {
            status: sf.status || 'created',
            formUrl: sf.form_url,
            shipmentCount: sf.shipment_count || 0,
            trackingCodes: sf.tracking_codes || [],
            updatedAt: new Date(),
          },
        });
      }
    }
  }

  // 3. Shipments Migration
  if (data.shipments) {
    for (const [id, ship] of Object.entries(data.shipments)) {
      if (!isDryRun) {
        await prisma.shipment.upsert({
          where: { easypostShipmentId: ship.easypost_shipment_id || id },
          create: {
            id: ship.id || id,
            instanceId: ship.instance_id,
            wixOrderId: ship.wix_order_id,
            easypostShipmentId: ship.easypost_shipment_id || id,
            status: ship.status || 'CREATED',
            carrier: ship.carrier || 'USPS',
            service: ship.service || 'Priority',
            rateId: ship.rate_id,
            rateAmount: ship.rate_amount || 0.0,
            rateCurrency: ship.rate_currency || 'USD',
            trackingCode: ship.tracking_code,
            trackerId: ship.tracker_id,
            wixFulfillmentId: ship.wix_fulfillment_id,
            senderAddress: ship.sender_address || {},
            recipientAddress: ship.recipient_address || {},
            parcelData: ship.parcel || {},
            customsInfo: ship.customs_info || null,
            ratesData: ship.rates || null,
            labelUrl: ship.label_url,
            labelFormat: ship.label_format || 'PDF',
            scanFormId: ship.scan_form_id,
            createdAt: ship.created_at ? new Date(ship.created_at) : new Date(),
            updatedAt: ship.updated_at ? new Date(ship.updated_at) : new Date(),
          },
          update: {
            status: ship.status || 'CREATED',
            carrier: ship.carrier || 'USPS',
            service: ship.service || 'Priority',
            trackingCode: ship.tracking_code,
            labelUrl: ship.label_url,
            scanFormId: ship.scan_form_id,
            updatedAt: new Date(),
          },
        });
      }
    }
  }

  // 4. Tracking Records Migration
  if (data.tracking) {
    for (const [code, tRec] of Object.entries(data.tracking)) {
      if (!isDryRun) {
        await prisma.trackingRecord.upsert({
          where: { trackingCode: tRec.tracking_code || code },
          create: {
            id: tRec.id || `trk-${code}`,
            instanceId: tRec.instance_id,
            trackingCode: tRec.tracking_code || code,
            easypostTrackerId: tRec.easypost_tracker_id,
            carrier: tRec.carrier || 'USPS',
            status: tRec.status || 'unknown',
            statusDetail: tRec.status_detail,
            publicUrl: tRec.public_url,
            estDeliveryDate: tRec.est_delivery_date,
            events: tRec.events || [],
            isDelivered: tRec.is_delivered ?? false,
            hasException: tRec.has_exception ?? false,
            lastCheckedAt: tRec.last_checked_at ? new Date(tRec.last_checked_at) : new Date(),
            createdAt: tRec.created_at ? new Date(tRec.created_at) : new Date(),
            updatedAt: tRec.updated_at ? new Date(tRec.updated_at) : new Date(),
          },
          update: {
            status: tRec.status,
            events: tRec.events || [],
            isDelivered: tRec.is_delivered,
            hasException: tRec.has_exception,
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    }
  }
}

async function main() {
  console.log(`Starting migration (Dry Run: ${isDryRun})...`);
  if (!fs.existsSync(STORAGE_DIR)) {
    console.log('No .storage directory found.');
    return;
  }

  const files = fs.readdirSync(STORAGE_DIR).filter((f) => f.startsWith('tenant_') && f.endsWith('.json'));
  for (const file of files) {
    await migrateTenantFile(path.join(STORAGE_DIR, file));
  }
  console.log('Migration complete.');
}

if (require.main === module) {
  main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
