import { EasyPostPackagePreset, DEFAULT_EASYPOST_PACKAGE_PRESETS } from '../types/app-data.model';

export interface RawLineItem {
  quantity?: number | null;
  physicalProperties?: {
    weight?: number | null;
    dimensions?: {
      length?: number | null;
      width?: number | null;
      height?: number | null;
    } | null;
  } | null;
}

export interface PackedParcel {
  length: number; // inches
  width: number; // inches
  height: number; // inches
  weight: number; // ounces
  predefinedPackage?: string;
  packagingType: string;
}

export interface PackingOptions {
  destinationCountry?: string;
  weightUnit?: string; // 'OZ' | 'LB' | 'KG' | 'G'
  dimensionUnit?: string; // 'IN' | 'CM' | 'MM' | 'M'
  defaultWeightOz?: number;
  packagePresets?: EasyPostPackagePreset[];
}

export interface PackingResult {
  parcel: PackedParcel;
  totalWeightOz: number;
  itemCount: number;
}

/**
 * Normalize any input weight to Ounces (oz).
 */
export function normalizeWeightToOz(amount: number, unit?: string): number {
  if (!amount || amount <= 0) return 0;
  const normalized = (unit || 'OZ').toUpperCase();
  switch (normalized) {
    case 'LB':
    case 'LBS':
      return amount * 16.0;
    case 'KG':
    case 'KILOGRAM':
      return amount * 35.27396;
    case 'G':
    case 'GRAM':
    case 'GRAMS':
      return amount * 0.03527396;
    case 'OZ':
    case 'OUNCE':
    case 'OUNCES':
    default:
      return amount;
  }
}

/**
 * Normalize any input dimension to Inches (in).
 */
export function normalizeDimensionToInches(amount: number, unit?: string): number {
  if (!amount || amount <= 0) return 0;
  const normalized = (unit || 'IN').toUpperCase();
  switch (normalized) {
    case 'CM':
    case 'CENTIMETER':
      return amount / 2.54;
    case 'MM':
    case 'MILLIMETER':
      return amount / 25.4;
    case 'M':
    case 'METER':
      return amount * 39.3701;
    case 'IN':
    case 'INCH':
    case 'INCHES':
    default:
      return amount;
  }
}

/**
 * Packs order line items into an optimal EasyPost parcel.
 */
export function packItemsForEasyPost(items: RawLineItem[], options: PackingOptions = {}): PackingResult {
  const presets =
    options.packagePresets && options.packagePresets.length > 0
      ? options.packagePresets
      : DEFAULT_EASYPOST_PACKAGE_PRESETS;

  const defaultWeightOz = options.defaultWeightOz ?? 16.0; // 1 lb default
  let totalWeightOz = 0;
  let totalVolumeCuIn = 0;
  let maxItemLength = 0;
  let maxItemWidth = 0;
  let maxItemHeight = 0;
  let totalItemCount = 0;

  for (const item of items) {
    const qty = Math.max(1, item.quantity ?? 1);
    totalItemCount += qty;

    const rawWeight = item.physicalProperties?.weight ?? (item as any)?.weight;
    const itemWeightOz =
      rawWeight && rawWeight > 0 ? normalizeWeightToOz(rawWeight, options.weightUnit) : defaultWeightOz;

    totalWeightOz += itemWeightOz * qty;

    const dims = item.physicalProperties?.dimensions;
    const l = dims?.length ? normalizeDimensionToInches(dims.length, options.dimensionUnit) : 4;
    const w = dims?.width ? normalizeDimensionToInches(dims.width, options.dimensionUnit) : 4;
    const h = dims?.height ? normalizeDimensionToInches(dims.height, options.dimensionUnit) : 2;

    maxItemLength = Math.max(maxItemLength, l);
    maxItemWidth = Math.max(maxItemWidth, w);
    maxItemHeight = Math.max(maxItemHeight, h);
    totalVolumeCuIn += l * w * h * qty;
  }

  // Ensure minimum physical weight of 1 oz
  totalWeightOz = Math.max(1.0, Math.round(totalWeightOz * 10) / 10);

  // Try finding an exact preset box that fits the items
  const sortedPresets = [...presets].sort((a, b) => a.length * a.width * a.height - b.length * b.width * b.height);

  for (const preset of sortedPresets) {
    const presetVolume = preset.length * preset.width * preset.height;
    const canHoldVolume = presetVolume >= totalVolumeCuIn * 1.15; // 15% packing margin
    const canHoldDimensions =
      preset.length >= maxItemLength && preset.width >= maxItemWidth && preset.height >= maxItemHeight;
    const canHoldWeight = preset.maxWeight >= totalWeightOz;

    if (canHoldVolume && canHoldDimensions && canHoldWeight) {
      return {
        parcel: {
          length: preset.length,
          width: preset.width,
          height: preset.height,
          weight: totalWeightOz,
          predefinedPackage: preset.predefinedPackage,
          packagingType: preset.name,
        },
        totalWeightOz,
        itemCount: totalItemCount,
      };
    }
  }

  // Fallback to custom calculated box dimensions
  // Estimate cube root of packed volume with 20% void fill padding
  const estSide = Math.ceil(Math.cbrt(totalVolumeCuIn * 1.2));
  const fallbackLength = Math.max(maxItemLength, estSide, 6);
  const fallbackWidth = Math.max(maxItemWidth, estSide, 4);
  const fallbackHeight = Math.max(maxItemHeight, estSide, 2);

  return {
    parcel: {
      length: Math.round(fallbackLength * 10) / 10,
      width: Math.round(fallbackWidth * 10) / 10,
      height: Math.round(fallbackHeight * 10) / 10,
      weight: totalWeightOz,
      packagingType: 'Custom Parcel',
    },
    totalWeightOz,
    itemCount: totalItemCount,
  };
}
