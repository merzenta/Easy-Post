/**
 * Shipment & Label Type Compatibility Re-export for EasyPost
 */

export * from './easypost.model';

// Aliases for unified interfaces
export type ShipmentStatus = import('./easypost.model').EasyPostShipmentStatus;
export type LabelFormat = import('./easypost.model').EasyPostLabelFormat;
export type EasyPostShipmentItemModel = import('./easypost.model').EasyPostShipmentItem;
