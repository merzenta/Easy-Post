import EasyPostClient from '@easypost/api';
import {
  EasyPostAddress,
  EasyPostCustomsInfo,
  EasyPostParcel,
  EasyPostRateOption,
  EasyPostTrackingRecord,
} from '../types/easypost.model';
import { logger } from './logger';
import { normalizeStateCode } from './address-helper';

export interface CreateShipmentOptions {
  fromAddress: EasyPostAddress;
  toAddress: EasyPostAddress;
  parcel: EasyPostParcel;
  customsInfo?: EasyPostCustomsInfo;
  carrierAccounts?: string[];
  reference?: string;
}

export interface PurchasedShipmentResult {
  shipmentId: string;
  trackingCode: string;
  labelUrl: string;
  trackerId?: string;
  publicUrl?: string;
  rateId: string;
  rateAmount: number;
  rateCurrency: string;
  carrier: string;
  service: string;
}

export class EasyPostService {
  private client: EasyPostClient;
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('EasyPost API key must be provided.');
    }
    this.apiKey = apiKey;
    this.client = new EasyPostClient(apiKey);
  }

  /**
   * Validate credentials by testing an authenticated call.
   */
  async validateApiKey(): Promise<{ valid: boolean; user?: string; error?: string }> {
    try {
      const user = await this.client.User.retrieveMe();
      return { valid: true, user: user.name || user.email || user.id };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        'EASYPOST_API_KEY_VALIDATION_FAILED',
        'EasyPost API key validation failed',
        err instanceof Error ? err : undefined,
        { error: message },
      );
      return { valid: false, error: message };
    }
  }

  /**
   * Create an EasyPost shipment to get real-time rates from all connected carriers.
   */
  async getRates(options: CreateShipmentOptions): Promise<{
    shipmentId: string;
    rates: EasyPostRateOption[];
  }> {
    try {
      const payload: Record<string, unknown> = {
        from_address: {
          name: options.fromAddress.name,
          company: options.fromAddress.company,
          street1: options.fromAddress.street1,
          street2: options.fromAddress.street2,
          city: options.fromAddress.city,
          state: normalizeStateCode(options.fromAddress.state, options.fromAddress.country),
          zip: options.fromAddress.zip,
          country: options.fromAddress.country,
          phone: options.fromAddress.phone,
          email: options.fromAddress.email,
        },
        to_address: {
          name: options.toAddress.name,
          company: options.toAddress.company,
          street1: options.toAddress.street1,
          street2: options.toAddress.street2,
          city: options.toAddress.city,
          state: normalizeStateCode(options.toAddress.state, options.toAddress.country),
          zip: options.toAddress.zip,
          country: options.toAddress.country,
          phone: options.toAddress.phone,
          email: options.toAddress.email,
        },
        parcel: {
          length: Math.max(0.1, Number(options.parcel.length || 6)),
          width: Math.max(0.1, Number(options.parcel.width || 4)),
          height: Math.max(0.1, Number(options.parcel.height || 2)),
          weight: Math.max(0.1, Number(options.parcel.weight || 16)),
          predefined_package: options.parcel.predefined_package || undefined,
        },
        reference: options.reference || undefined,
      };

      if (options.carrierAccounts && options.carrierAccounts.length > 0) {
        payload.carrier_accounts = options.carrierAccounts;
      }

      if (options.customsInfo && options.customsInfo.customs_items?.length) {
        payload.customs_info = {
          customs_cert: options.customsInfo.customs_cert ?? true,
          customs_signer: options.customsInfo.customs_signer || options.fromAddress.name || 'Shipper',
          contents_type: options.customsInfo.contents_type || 'merchandise',
          contents_explanation: options.customsInfo.contents_explanation,
          eel_pfc: options.customsInfo.eel_pfc || 'NOEEI 30.37(a)',
          non_delivery_option: options.customsInfo.non_delivery_option || 'return',
          customs_items: options.customsInfo.customs_items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            weight: item.weight,
            value: item.value,
            hs_tariff_number: item.hs_tariff_number,
            origin_country: item.origin_country || 'US',
          })),
        };
      }

      logger.info('EASYPOST_RATES_REQUEST', 'Requesting EasyPost shipment rates', {
        toZip: options.toAddress.zip,
        toCountry: options.toAddress.country,
        parcelWeightOz: options.parcel.weight,
      });

      const shipment = await this.client.Shipment.create(payload as any);

      const rates: EasyPostRateOption[] = (shipment.rates || []).map((r: any) => ({
        id: r.id,
        carrier: r.carrier,
        service: r.service,
        rate: String(r.rate),
        currency: r.currency || 'USD',
        retail_rate: r.retail_rate ? String(r.retail_rate) : null,
        list_rate: r.list_rate ? String(r.list_rate) : null,
        delivery_days: r.delivery_days ?? r.est_delivery_days ?? null,
        delivery_date: r.delivery_date ?? null,
        est_delivery_days: r.est_delivery_days ?? null,
      }));

      return {
        shipmentId: shipment.id,
        rates,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('EASYPOST_GET_RATES_ERROR', 'EasyPost getRates error', err instanceof Error ? err : undefined, {
        error: message,
      });
      throw err;
    }
  }

  /**
   * Buy a postage label for an existing shipment using the selected rate ID.
   */
  async buyShipment(shipmentId: string, rateId: string, insuranceAmount?: number): Promise<PurchasedShipmentResult> {
    try {
      logger.info('EASYPOST_BUY_LABEL', 'Buying EasyPost shipping label', { shipmentId, rateId, insuranceAmount });

      const bought = await this.client.Shipment.buy(shipmentId, rateId, insuranceAmount || null);

      const labelUrl =
        bought.postage_label?.label_url ||
        bought.postage_label?.label_pdf_url ||
        bought.postage_label?.label_zpl_url ||
        '';

      const trackingCode = bought.tracking_code || '';
      const trackerId = bought.tracker?.id;
      const publicUrl = bought.tracker?.public_url || undefined;
      const selectedRate = bought.selected_rate as any;

      return {
        shipmentId: bought.id,
        trackingCode,
        labelUrl,
        trackerId,
        publicUrl,
        rateId: selectedRate?.id || rateId,
        rateAmount: selectedRate ? parseFloat(selectedRate.rate) : 0,
        rateCurrency: selectedRate?.currency || 'USD',
        carrier: selectedRate?.carrier || '',
        service: selectedRate?.service || '',
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const subErrors = (err as any)?.errors
        ?.map((e: any) => e.message || (typeof e === 'string' ? e : JSON.stringify(e)))
        .filter(Boolean)
        .join(', ');
      const fullMessage = subErrors ? `${message}: ${subErrors}` : message;
      logger.error(
        'EASYPOST_BUY_SHIPMENT_ERROR',
        'EasyPost buyShipment error',
        err instanceof Error ? err : undefined,
        { shipmentId, rateId, error: fullMessage, subErrors },
      );
      throw new Error(fullMessage);
    }
  }

  /**
   * Create an End-of-Day SCAN form / manifest for driver pickup.
   */
  async createScanForm(shipmentIds: string[]): Promise<{
    id: string;
    status: 'created' | 'failed';
    formUrl?: string;
    trackingCodes: string[];
    batchId?: string;
    message?: string;
  }> {
    try {
      logger.info('EASYPOST_CREATE_SCAN_FORM', 'Creating EasyPost SCAN Form', { shipmentCount: shipmentIds.length });

      const scanForm = await this.client.ScanForm.create({
        shipments: shipmentIds.map((id) => ({ id })),
      });

      return {
        id: scanForm.id,
        status: (scanForm.status as 'created' | 'failed') || 'created',
        formUrl: scanForm.form_url || undefined,
        trackingCodes: scanForm.tracking_codes || [],
        batchId: scanForm.batch_id || undefined,
        message: scanForm.message || undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        'EASYPOST_CREATE_SCAN_FORM_ERROR',
        'EasyPost createScanForm error',
        err instanceof Error ? err : undefined,
        { error: message },
      );
      throw err;
    }
  }

  /**
   * Track a package by tracking code or create a tracker.
   */
  async trackPackage(trackingCode: string, carrier?: string): Promise<Partial<EasyPostTrackingRecord>> {
    try {
      logger.info('EASYPOST_TRACK_PACKAGE', 'Querying EasyPost tracker', { trackingCode, carrier });

      const tracker = await this.client.Tracker.create({
        tracking_code: trackingCode,
        carrier: carrier || undefined,
      });

      const events = (tracker.tracking_details || []).map((detail: any) => ({
        datetime: detail.datetime || '',
        message: detail.message || '',
        status: detail.status || '',
        location: detail.tracking_location
          ? `${detail.tracking_location.city || ''}, ${detail.tracking_location.state || ''} ${detail.tracking_location.country || ''}`.trim()
          : undefined,
      }));

      const isDelivered = tracker.status === 'delivered';
      const hasException = tracker.status === 'failure' || tracker.status === 'return_to_sender';

      return {
        tracking_code: tracker.tracking_code || trackingCode,
        easypost_tracker_id: tracker.id,
        carrier: tracker.carrier || carrier || 'USPS',
        status: (tracker.status as any) || 'unknown',
        status_detail: tracker.status_detail || undefined,
        public_url: tracker.public_url || undefined,
        est_delivery_date: tracker.est_delivery_date || undefined,
        events,
        is_delivered: isDelivered,
        has_exception: hasException,
        last_checked_at: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        'EASYPOST_TRACK_PACKAGE_ERROR',
        'EasyPost trackPackage error',
        err instanceof Error ? err : undefined,
        { trackingCode, error: message },
      );
      throw err;
    }
  }

  /**
   * Verify a physical address with EasyPost address verification.
   */
  async verifyAddress(address: EasyPostAddress): Promise<{
    verifiedAddress: EasyPostAddress;
    isValid: boolean;
    errors?: string[];
  }> {
    try {
      const result = await this.client.Address.create({
        name: address.name,
        company: address.company,
        street1: address.street1,
        street2: address.street2,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country,
        phone: address.phone,
        email: address.email,
        verify: true,
      } as any);

      const delivery = (result.verifications as any)?.delivery;
      const isValid = delivery ? delivery.success : true;
      const errors = delivery?.errors?.map((e: any) => e.message) || [];

      return {
        verifiedAddress: {
          name: result.name || address.name,
          company: result.company || address.company,
          street1: result.street1 || address.street1,
          street2: result.street2 || address.street2,
          city: result.city || address.city,
          state: result.state || address.state,
          zip: result.zip || address.zip,
          country: result.country || address.country,
          phone: result.phone || address.phone,
          email: result.email || address.email,
          residential: result.residential ?? address.residential,
        },
        isValid,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        'EASYPOST_ADDRESS_VERIFY_ERROR',
        'EasyPost address verification error',
        err instanceof Error ? err : undefined,
        { error: message },
      );
      return {
        verifiedAddress: address,
        isValid: false,
        errors: [message],
      };
    }
  }
}

let customClientFactory: ((apiKey: string) => EasyPostService) | null = null;

export function setEasyPostClientFactory(factory: ((apiKey: string) => EasyPostService) | null) {
  customClientFactory = factory;
}

export function createEasyPostClient(apiKey: string): EasyPostService {
  if (customClientFactory) {
    return customClientFactory(apiKey);
  }
  return new EasyPostService(apiKey);
}
