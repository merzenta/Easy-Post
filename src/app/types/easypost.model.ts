/**
 * EasyPost API & Domain Type Definitions
 * Maps EasyPost Node SDK objects to Wix Shipping SPI and Dashboard models.
 */

export type EasyPostEnvironment = 'TEST' | 'PRODUCTION';

export type EasyPostLabelFormat = 'PDF' | 'PNG' | 'ZPL' | 'EPL2';

export type EasyPostShipmentStatus = 'CREATED' | 'LABEL_PENDING' | 'LABEL_PURCHASED' | 'MANIFESTED' | 'CANCELLED';

export interface EasyPostAddress {
  name?: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
  residential?: boolean;
}

export interface EasyPostParcel {
  length: number; // inches
  width: number; // inches
  height: number; // inches
  weight: number; // ounces
  predefined_package?: string;
}

export interface EasyPostCustomsItem {
  description: string;
  quantity: number;
  weight: number; // ounces
  value: number; // USD
  hs_tariff_number?: string;
  origin_country?: string;
}

export interface EasyPostCustomsInfo {
  customs_cert?: boolean;
  customs_signer?: string;
  contents_type?: 'merchandise' | 'gift' | 'documents' | 'returned_goods' | 'sample' | 'other';
  contents_explanation?: string;
  eel_pfc?: string;
  non_delivery_option?: 'return' | 'abandon';
  restriction_type?: 'none' | 'other' | 'quarantine' | 'sanitary_phytosanitary_inspection';
  customs_items: EasyPostCustomsItem[];
}

export interface EasyPostRateOption {
  id: string; // e.g. "rate_..."
  carrier: string; // e.g. "USPS", "FedEx", "UPS", "DHL"
  service: string; // e.g. "Priority", "GroundAdvantage", "NextDayAir"
  rate: string; // string decimal e.g. "7.50"
  currency: string; // e.g. "USD"
  retail_rate?: string | null;
  list_rate?: string | null;
  delivery_days?: number | null;
  delivery_date?: string | null;
  est_delivery_days?: number | null;
}

export type EasyPostRate = EasyPostRateOption;

export interface EasyPostShipmentItem {
  id: string;
  item_id: string;
  title: string;
  quantity: number;
  weight_oz: number;
  length_in?: number;
  width_in?: number;
  height_in?: number;
  price?: number;
}

export interface EasyPostShipment {
  id: string; // Internal UUID
  instance_id: string;
  wix_order_id: string;
  easypost_shipment_id: string; // "shp_..."
  status: EasyPostShipmentStatus;
  carrier: string;
  service: string;
  rate_id?: string;
  rate_amount: number;
  rate_currency: string;
  tracking_code?: string;
  tracker_id?: string;
  label_url?: string;
  label_format: EasyPostLabelFormat;
  wix_fulfillment_id?: string;
  sender_address: EasyPostAddress;
  recipient_address: EasyPostAddress;
  parcel: EasyPostParcel;
  customs_info?: EasyPostCustomsInfo;
  items: EasyPostShipmentItem[];
  rates?: EasyPostRateOption[];
  scan_form_id?: string;
  created_at: string;
  updated_at: string;
}

export interface EasyPostScanForm {
  id: string; // Internal UUID
  instance_id: string;
  easypost_scan_form_id: string; // "scan_..."
  status: 'created' | 'failed';
  form_url?: string;
  form_file_type?: string;
  shipment_count: number;
  tracking_codes: string[];
  batch_id?: string;
  message?: string;
  created_at: string;
  updated_at: string;
}

export interface EasyPostTrackingEvent {
  datetime: string;
  message: string;
  status: string;
  location?: string;
}

export interface EasyPostTrackingRecord {
  id: string; // Internal UUID
  instance_id: string;
  tracking_code: string;
  easypost_tracker_id?: string;
  carrier: string;
  status: 'pre_transit' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'return_to_sender' | 'failure' | 'unknown';
  status_detail?: string;
  public_url?: string;
  est_delivery_date?: string;
  events: EasyPostTrackingEvent[];
  is_delivered: boolean;
  has_exception: boolean;
  last_checked_at: string;
  created_at: string;
  updated_at: string;
}
