import { shippingRates } from '@wix/ecom/service-plugins';
import { EasyPostEnvironment, EasyPostLabelFormat } from './easypost.model';

export enum ShippingUnitOfMeasure {
  NUM_OF_ITEMS = 'NUM_OF_ITEMS',
  WEIGHT_IN_KG = 'WEIGHT_IN_KG',
  WEIGHT_IN_LB = 'WEIGHT_IN_LB',
}

export enum ShippingMethodType {
  STANDARD = 'STANDARD',
  EXPRESS = 'EXPRESS',
}

export interface ShippingCosts {
  first: number;
  second: number;
  thirdAndUp: number;
}

export interface ShippingAppData {
  shippingMethods: {
    code: string;
    title: string;
    logistics?: shippingRates.DeliveryLogistics;
    type: ShippingMethodType;
    unitOfMeasure: ShippingUnitOfMeasure;
    costs: ShippingCosts;
  }[];
}

export interface EasyPostPackagePreset {
  id: string;
  name: string;
  length: number; // inches
  width: number; // inches
  height: number; // inches
  maxWeight: number; // ounces
  predefinedPackage?: string; // e.g. "Parcel", "FlatRateEnvelope", "SmallFlatRateBox"
}

export type HandlingFeeType = 'NONE' | 'FLAT' | 'PERCENTAGE';

export interface EasyPostMerchantLocation {
  name?: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  email?: string;
}

export interface MerchantSettings {
  instanceId: string;
  environment: EasyPostEnvironment;
  apiKey: string; // Test key `EZTK...` or Prod key `EZAK...`
  webhookSecret?: string;
  defaultLabelFormat: EasyPostLabelFormat;
  merchantLocation: EasyPostMerchantLocation;
  packagePresets: EasyPostPackagePreset[];
  enabledCarriers: string[]; // e.g., ["USPS", "FedEx", "UPS", "DHL"]
  carrierAccounts: string[]; // EasyPost carrier account IDs e.g. ["ca_..."]
  handlingFeeType: HandlingFeeType;
  handlingFeeValue: number;
  freeShippingThreshold?: number;
  fallbackRate: number;
  defaultItemWeightOz: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_EASYPOST_PACKAGE_PRESETS: EasyPostPackagePreset[] = [
  {
    id: 'box-small',
    name: 'Small Box',
    length: 6,
    width: 6,
    height: 4,
    maxWeight: 80,
    predefinedPackage: 'SmallFlatRateBox',
  },
  {
    id: 'box-medium',
    name: 'Medium Box',
    length: 11,
    width: 8.5,
    height: 5.5,
    maxWeight: 320,
    predefinedPackage: 'MediumFlatRateBox',
  },
  {
    id: 'box-large',
    name: 'Large Box',
    length: 12,
    width: 12,
    height: 8,
    maxWeight: 640,
    predefinedPackage: 'LargeFlatRateBox',
  },
  {
    id: 'envelope-flat',
    name: 'Flat Rate Envelope',
    length: 12.5,
    width: 9.5,
    height: 0.75,
    maxWeight: 70,
    predefinedPackage: 'FlatRateEnvelope',
  },
];
