import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../utils/prisma';
import { decryptCredential, encryptCredential } from '../utils/crypto';
import { DEFAULT_EASYPOST_PACKAGE_PRESETS, MerchantSettings } from '../types/app-data.model';
import {
  EasyPostScanForm,
  EasyPostShipment,
  EasyPostShipmentStatus,
  EasyPostTrackingRecord,
} from '../types/easypost.model';
import {
  IMerchantSettingsRepository,
  IScanFormRepository,
  IShipmentRepository,
  ITrackingRepository,
} from './interfaces';

function getDefaultSettings(instanceId: string): MerchantSettings {
  return {
    instanceId,
    environment: 'TEST',
    apiKey: '',
    webhookSecret: '',
    defaultLabelFormat: 'PDF',
    merchantLocation: {
      name: 'Shipping Dept',
      company: 'My Store',
      street1: '388 Beale St',
      street2: '',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
      phone: '4155551234',
      email: 'support@mystore.com',
    },
    packagePresets: [...DEFAULT_EASYPOST_PACKAGE_PRESETS],
    enabledCarriers: ['USPS', 'FedEx', 'UPS', 'DHL'],
    carrierAccounts: [],
    handlingFeeType: 'NONE',
    handlingFeeValue: 0.0,
    fallbackRate: 10.0,
    defaultItemWeightOz: 16.0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// -------------------------------------------------------------
// 1. Merchant Settings Repository (Prisma)
// -------------------------------------------------------------
export class PrismaMerchantSettingsRepository implements IMerchantSettingsRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  private mapToDomain(row: any): MerchantSettings {
    return {
      instanceId: row.instanceId,
      environment: (row.environment as any) || 'TEST',
      apiKey: decryptCredential(row.apiKeyEncrypted || ''),
      webhookSecret: row.webhookSecret ? decryptCredential(row.webhookSecret) : '',
      defaultLabelFormat: (row.defaultLabelFormat as any) || 'PDF',
      merchantLocation: (row.merchantLocation as any) || {
        name: 'Shipping Dept',
        company: 'My Store',
        street1: '388 Beale St',
        street2: '',
        city: 'San Francisco',
        state: 'CA',
        zip: '94105',
        country: 'US',
        phone: '4155551234',
        email: 'support@mystore.com',
      },
      packagePresets: (row.packagePresets as any) || [...DEFAULT_EASYPOST_PACKAGE_PRESETS],
      enabledCarriers: (row.enabledCarriers as string[]) || ['USPS', 'FedEx', 'UPS', 'DHL'],
      carrierAccounts: (row.carrierAccounts as string[]) || [],
      handlingFeeType: (row.handlingFeeType as any) || 'NONE',
      handlingFeeValue: row.handlingFeeValue ?? 0.0,
      freeShippingThreshold: row.freeShippingThreshold ?? undefined,
      fallbackRate: row.fallbackRate ?? 10.0,
      defaultItemWeightOz: row.defaultItemWeightOz ?? 16.0,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  async getSettings(instanceId: string): Promise<MerchantSettings | null> {
    const row = await this.prisma.merchantSettings.findUnique({
      where: { instanceId },
    });
    if (!row) {
      return getDefaultSettings(instanceId);
    }
    return this.mapToDomain(row);
  }

  async saveSettings(instanceId: string, settings: Partial<MerchantSettings>): Promise<MerchantSettings> {
    const existing = await this.prisma.merchantSettings.findUnique({
      where: { instanceId },
    });

    const encryptedKey =
      settings.apiKey !== undefined ? encryptCredential(settings.apiKey) : (existing?.apiKeyEncrypted ?? '');

    const encryptedWebhook =
      settings.webhookSecret !== undefined ? encryptCredential(settings.webhookSecret) : existing?.webhookSecret;

    const row = await this.prisma.merchantSettings.upsert({
      where: { instanceId },
      create: {
        instanceId,
        environment: settings.environment || 'TEST',
        apiKeyEncrypted: encryptedKey,
        webhookSecret: encryptedWebhook,
        defaultLabelFormat: settings.defaultLabelFormat || 'PDF',
        merchantLocation: (settings.merchantLocation as any) || {
          name: 'Shipping Dept',
          company: 'My Store',
          street1: '388 Beale St',
          street2: '',
          city: 'San Francisco',
          state: 'CA',
          zip: '94105',
          country: 'US',
          phone: '4155551234',
        },
        packagePresets: (settings.packagePresets as any) || DEFAULT_EASYPOST_PACKAGE_PRESETS,
        enabledCarriers: (settings.enabledCarriers as any) || ['USPS', 'FedEx', 'UPS', 'DHL'],
        carrierAccounts: (settings.carrierAccounts as any) || [],
        handlingFeeType: settings.handlingFeeType || 'NONE',
        handlingFeeValue: settings.handlingFeeValue ?? 0.0,
        freeShippingThreshold: settings.freeShippingThreshold,
        fallbackRate: settings.fallbackRate ?? 10.0,
        defaultItemWeightOz: settings.defaultItemWeightOz ?? 16.0,
      },
      update: {
        environment: settings.environment,
        apiKeyEncrypted: encryptedKey,
        webhookSecret: encryptedWebhook,
        defaultLabelFormat: settings.defaultLabelFormat,
        ...(settings.merchantLocation && { merchantLocation: settings.merchantLocation as any }),
        ...(settings.packagePresets && { packagePresets: settings.packagePresets as any }),
        ...(settings.enabledCarriers && { enabledCarriers: settings.enabledCarriers as any }),
        ...(settings.carrierAccounts && { carrierAccounts: settings.carrierAccounts as any }),
        ...(settings.handlingFeeType && { handlingFeeType: settings.handlingFeeType }),
        ...(settings.handlingFeeValue !== undefined && { handlingFeeValue: settings.handlingFeeValue }),
        ...(settings.freeShippingThreshold !== undefined && { freeShippingThreshold: settings.freeShippingThreshold }),
        ...(settings.fallbackRate !== undefined && { fallbackRate: settings.fallbackRate }),
        ...(settings.defaultItemWeightOz !== undefined && { defaultItemWeightOz: settings.defaultItemWeightOz }),
      },
    });

    return this.mapToDomain(row);
  }

  async hasConfiguredCredentials(instanceId: string): Promise<boolean> {
    const s = await this.getSettings(instanceId);
    return Boolean(s && s.apiKey && s.apiKey.trim().length > 0);
  }
}

// -------------------------------------------------------------
// 2. Shipments Repository (Prisma)
// -------------------------------------------------------------
export class PrismaShipmentRepository implements IShipmentRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  private mapToDomain(row: any): EasyPostShipment {
    return {
      id: row.id,
      instance_id: row.instanceId,
      wix_order_id: row.wixOrderId,
      easypost_shipment_id: row.easypostShipmentId,
      status: row.status as EasyPostShipmentStatus,
      carrier: row.carrier,
      service: row.service,
      rate_id: row.rateId ?? undefined,
      rate_amount: row.rateAmount ?? 0.0,
      rate_currency: row.rateCurrency ?? 'USD',
      tracking_code: row.trackingCode ?? undefined,
      tracker_id: row.trackerId ?? undefined,
      label_url: row.labelUrl ?? undefined,
      label_format: (row.labelFormat as any) || 'PDF',
      wix_fulfillment_id: row.wixFulfillmentId ?? undefined,
      sender_address: row.senderAddress as any,
      recipient_address: row.recipientAddress as any,
      parcel: row.parcelData as any,
      customs_info: row.customsInfo as any,
      rates: row.ratesData as any,
      scan_form_id: row.scanFormId ?? undefined,
      items: Array.isArray(row.items)
        ? row.items.map((item: any) => ({
            id: item.id,
            item_id: item.itemId,
            title: item.title,
            quantity: item.quantity,
            weight_oz: item.weightOz,
            length_in: item.lengthIn ?? undefined,
            width_in: item.widthIn ?? undefined,
            height_in: item.heightIn ?? undefined,
            price: item.price ?? undefined,
          }))
        : [],
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  async saveShipment(shipment: EasyPostShipment): Promise<EasyPostShipment> {
    const row = await this.prisma.shipment.upsert({
      where: { easypostShipmentId: shipment.easypost_shipment_id },
      create: {
        id: shipment.id,
        instanceId: shipment.instance_id,
        wixOrderId: shipment.wix_order_id || '',
        easypostShipmentId: shipment.easypost_shipment_id,
        status: shipment.status || 'CREATED',
        carrier: shipment.carrier || 'USPS',
        service: shipment.service || 'Priority',
        rateId: shipment.rate_id ?? null,
        rateAmount: shipment.rate_amount ?? 0.0,
        rateCurrency: shipment.rate_currency || 'USD',
        trackingCode: shipment.tracking_code ?? null,
        trackerId: shipment.tracker_id ?? null,
        labelUrl: shipment.label_url ?? null,
        labelFormat: shipment.label_format || 'PDF',
        wixFulfillmentId: shipment.wix_fulfillment_id ?? null,
        senderAddress: (shipment.sender_address as any) || {},
        recipientAddress: (shipment.recipient_address as any) || {},
        parcelData: (shipment.parcel as any) || {},
        customsInfo: shipment.customs_info ? (shipment.customs_info as any) : undefined,
        ratesData: (shipment.rates as any) || [],
        scanFormId: shipment.scan_form_id ?? null,
        items: {
          create: (shipment.items || []).map((it) => ({
            itemId: it.item_id || 'item-1',
            title: it.title || 'Item',
            quantity: it.quantity ?? 1,
            weightOz: it.weight_oz ?? 16,
            lengthIn: it.length_in,
            widthIn: it.width_in,
            heightIn: it.height_in,
            price: it.price,
          })),
        },
      },
      update: {
        status: shipment.status,
        ...(shipment.wix_order_id ? { wixOrderId: shipment.wix_order_id } : {}),
        carrier: shipment.carrier,
        service: shipment.service,
        rateId: shipment.rate_id ?? null,
        rateAmount: shipment.rate_amount ?? 0.0,
        rateCurrency: shipment.rate_currency,
        trackingCode: shipment.tracking_code ?? null,
        trackerId: shipment.tracker_id ?? null,
        labelUrl: shipment.label_url ?? null,
        labelFormat: shipment.label_format,
        wixFulfillmentId: shipment.wix_fulfillment_id ?? null,
        scanFormId: shipment.scan_form_id ?? null,
        ratesData: (shipment.rates as any) || [],
      },
      include: { items: true },
    });

    return this.mapToDomain(row);
  }

  async getShipmentById(instanceId: string, shipmentId: string): Promise<EasyPostShipment | null> {
    const row = await this.prisma.shipment.findFirst({
      where: { instanceId, id: shipmentId },
      include: { items: true },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async getShipmentByEasyPostId(instanceId: string, easypostShipmentId: string): Promise<EasyPostShipment | null> {
    const row = await this.prisma.shipment.findFirst({
      where: { instanceId, easypostShipmentId },
      include: { items: true },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async getShipmentsByOrderId(instanceId: string, orderId: string): Promise<EasyPostShipment[]> {
    const rows = await this.prisma.shipment.findMany({
      where: { instanceId, wixOrderId: orderId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  async listShipments(
    instanceId: string,
    filter?: { status?: EasyPostShipmentStatus; limit?: number },
  ): Promise<EasyPostShipment[]> {
    const rows = await this.prisma.shipment.findMany({
      where: {
        instanceId,
        ...(filter?.status && { status: filter.status }),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: filter?.limit,
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  async getUnmanifestedShipments(instanceId: string): Promise<EasyPostShipment[]> {
    const rows = await this.prisma.shipment.findMany({
      where: {
        instanceId,
        status: 'LABEL_PURCHASED',
        scanFormId: null,
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  async deleteShipment(instanceId: string, shipmentId: string): Promise<boolean> {
    try {
      await this.prisma.shipment.deleteMany({
        where: { instanceId, id: shipmentId },
      });
      return true;
    } catch {
      return false;
    }
  }

  async updateShipmentStatus(
    instanceId: string,
    shipmentId: string,
    status: EasyPostShipmentStatus,
    extra?: Partial<EasyPostShipment>,
  ): Promise<EasyPostShipment | null> {
    try {
      const row = await this.prisma.shipment.update({
        where: { id: shipmentId },
        data: {
          status,
          ...(extra?.tracking_code && { trackingCode: extra.tracking_code }),
          ...(extra?.tracker_id && { trackerId: extra.tracker_id }),
          ...(extra?.label_url && { labelUrl: extra.label_url }),
          ...(extra?.wix_fulfillment_id && { wixFulfillmentId: extra.wix_fulfillment_id }),
          ...(extra?.scan_form_id && { scanFormId: extra.scan_form_id }),
        },
        include: { items: true },
      });
      return this.mapToDomain(row);
    } catch {
      return null;
    }
  }
}

// -------------------------------------------------------------
// 3. SCAN Form Repository (Prisma)
// -------------------------------------------------------------
export class PrismaScanFormRepository implements IScanFormRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  private mapToDomain(row: any): EasyPostScanForm {
    return {
      id: row.id,
      instance_id: row.instanceId,
      easypost_scan_form_id: row.easypostScanFormId,
      status: (row.status as any) || 'created',
      form_url: row.formUrl ?? undefined,
      form_file_type: row.formFileType ?? 'PDF',
      shipment_count: row.shipmentCount ?? 0,
      tracking_codes: (row.trackingCodes as string[]) || [],
      batch_id: row.batchId ?? undefined,
      message: row.message ?? undefined,
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  async saveScanForm(scanForm: EasyPostScanForm): Promise<EasyPostScanForm> {
    const row = await this.prisma.scanFormOrder.upsert({
      where: { easypostScanFormId: scanForm.easypost_scan_form_id },
      create: {
        id: scanForm.id,
        instanceId: scanForm.instance_id,
        easypostScanFormId: scanForm.easypost_scan_form_id,
        status: scanForm.status,
        formUrl: scanForm.form_url,
        formFileType: scanForm.form_file_type || 'PDF',
        shipmentCount: scanForm.shipment_count,
        trackingCodes: scanForm.tracking_codes as any,
        batchId: scanForm.batch_id,
        message: scanForm.message,
      },
      update: {
        status: scanForm.status,
        formUrl: scanForm.form_url,
        formFileType: scanForm.form_file_type,
        shipmentCount: scanForm.shipment_count,
        trackingCodes: scanForm.tracking_codes as any,
        message: scanForm.message,
      },
    });

    return this.mapToDomain(row);
  }

  async getScanFormById(instanceId: string, scanFormId: string): Promise<EasyPostScanForm | null> {
    const row = await this.prisma.scanFormOrder.findFirst({
      where: {
        instanceId,
        OR: [{ id: scanFormId }, { easypostScanFormId: scanFormId }],
      },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async listScanForms(instanceId: string, limit?: number): Promise<EasyPostScanForm[]> {
    const rows = await this.prisma.scanFormOrder.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.mapToDomain(r));
  }
}

// -------------------------------------------------------------
// 4. Tracking Repository (Prisma)
// -------------------------------------------------------------
export class PrismaTrackingRepository implements ITrackingRepository {
  constructor(private prisma: PrismaClient = defaultPrisma) {}

  private mapToDomain(row: any): EasyPostTrackingRecord {
    return {
      id: row.id,
      instance_id: row.instanceId,
      tracking_code: row.trackingCode,
      easypost_tracker_id: row.easypostTrackerId ?? undefined,
      carrier: row.carrier,
      status: row.status as any,
      status_detail: row.statusDetail ?? undefined,
      public_url: row.publicUrl ?? undefined,
      est_delivery_date: row.estDeliveryDate ?? undefined,
      events: (row.events as any) || [],
      is_delivered: row.isDelivered,
      has_exception: row.hasException,
      last_checked_at: row.lastCheckedAt ? new Date(row.lastCheckedAt).toISOString() : new Date().toISOString(),
      created_at: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
      updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  async saveTrackingRecord(record: EasyPostTrackingRecord): Promise<EasyPostTrackingRecord> {
    const row = await this.prisma.trackingRecord.upsert({
      where: { trackingCode: record.tracking_code },
      create: {
        id: record.id,
        instanceId: record.instance_id,
        trackingCode: record.tracking_code,
        easypostTrackerId: record.easypost_tracker_id,
        carrier: record.carrier,
        status: record.status,
        statusDetail: record.status_detail,
        publicUrl: record.public_url,
        estDeliveryDate: record.est_delivery_date,
        events: record.events as any,
        isDelivered: record.is_delivered,
        hasException: record.has_exception,
        lastCheckedAt: new Date(record.last_checked_at),
      },
      update: {
        easypostTrackerId: record.easypost_tracker_id,
        carrier: record.carrier,
        status: record.status,
        statusDetail: record.status_detail,
        publicUrl: record.public_url,
        estDeliveryDate: record.est_delivery_date,
        events: record.events as any,
        isDelivered: record.is_delivered,
        hasException: record.has_exception,
        lastCheckedAt: new Date(record.last_checked_at),
      },
    });

    return this.mapToDomain(row);
  }

  async getTrackingRecord(instanceId: string, trackingCode: string): Promise<EasyPostTrackingRecord | null> {
    const row = await this.prisma.trackingRecord.findFirst({
      where: { instanceId, trackingCode },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async listTrackingRecords(
    instanceId: string,
    filter?: { hasException?: boolean; isDelivered?: boolean },
  ): Promise<EasyPostTrackingRecord[]> {
    const rows = await this.prisma.trackingRecord.findMany({
      where: {
        instanceId,
        ...(filter?.hasException !== undefined && { hasException: filter.hasException }),
        ...(filter?.isDelivered !== undefined && { isDelivered: filter.isDelivered }),
      },
      orderBy: { lastCheckedAt: 'desc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }
}
