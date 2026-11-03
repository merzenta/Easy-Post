import { MerchantSettings } from '../types/app-data.model';
import {
  EasyPostScanForm,
  EasyPostShipment,
  EasyPostShipmentStatus,
  EasyPostTrackingRecord,
} from '../types/easypost.model';

export interface IMerchantSettingsRepository {
  getSettings(instanceId: string): Promise<MerchantSettings | null>;
  saveSettings(instanceId: string, settings: Partial<MerchantSettings>): Promise<MerchantSettings>;
  hasConfiguredCredentials(instanceId: string): Promise<boolean>;
}

export interface IShipmentRepository {
  saveShipment(shipment: EasyPostShipment): Promise<EasyPostShipment>;
  getShipmentById(instanceId: string, shipmentId: string): Promise<EasyPostShipment | null>;
  getShipmentByEasyPostId(instanceId: string, easypostShipmentId: string): Promise<EasyPostShipment | null>;
  getShipmentsByOrderId(instanceId: string, orderId: string): Promise<EasyPostShipment[]>;
  listShipments(
    instanceId: string,
    filter?: { status?: EasyPostShipmentStatus; limit?: number },
  ): Promise<EasyPostShipment[]>;
  getUnmanifestedShipments(instanceId: string): Promise<EasyPostShipment[]>;
  deleteShipment(instanceId: string, shipmentId: string): Promise<boolean>;
  updateShipmentStatus(
    instanceId: string,
    shipmentId: string,
    status: EasyPostShipmentStatus,
    extra?: Partial<EasyPostShipment>,
  ): Promise<EasyPostShipment | null>;
}

export interface IScanFormRepository {
  saveScanForm(scanForm: EasyPostScanForm): Promise<EasyPostScanForm>;
  getScanFormById(instanceId: string, scanFormId: string): Promise<EasyPostScanForm | null>;
  listScanForms(instanceId: string, limit?: number): Promise<EasyPostScanForm[]>;
}

export interface ITrackingRepository {
  saveTrackingRecord(record: EasyPostTrackingRecord): Promise<EasyPostTrackingRecord>;
  getTrackingRecord(instanceId: string, trackingCode: string): Promise<EasyPostTrackingRecord | null>;
  listTrackingRecords(
    instanceId: string,
    filter?: { hasException?: boolean; isDelivered?: boolean },
  ): Promise<EasyPostTrackingRecord[]>;
}
