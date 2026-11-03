'use client';

import React, { useState } from 'react';
import { Modal, CustomModalLayout, Box, Text, Badge, Button, Divider, Layout, Cell, Card } from '@wix/design-system';
import { Duplicate, Check } from '@wix/wix-ui-icons-common';
import { EasyPostShipment } from '@/app/types/easypost.model';
import { formatCarrierService } from '@/app/utils/rate-matcher';
import { extractOrderRecipient } from '@/app/utils/address-helper';

export interface ShipmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: EasyPostShipment | null;
  orderNumber?: string;
  order?: any;
}

export function ShipmentDetailsModal({ isOpen, onClose, shipment, orderNumber, order }: ShipmentDetailsModalProps) {
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [copiedShipmentId, setCopiedShipmentId] = useState(false);

  if (!isOpen || !shipment) return null;

  const displayOrderNum = orderNumber || shipment.wix_order_id || 'N/A';
  const hasLabel = Boolean(shipment.label_url);

  const handlePrintLabel = () => {
    if (shipment.label_url) {
      window.open(shipment.label_url, '_blank');
    }
  };

  const handleCopyTracking = () => {
    if (shipment.tracking_code) {
      navigator.clipboard.writeText(shipment.tracking_code);
      setCopiedTracking(true);
      setTimeout(() => setCopiedTracking(false), 2000);
    }
  };

  const handleCopyShipmentId = () => {
    const idToCopy = shipment.easypost_shipment_id || shipment.id;
    if (idToCopy) {
      navigator.clipboard.writeText(idToCopy);
      setCopiedShipmentId(true);
      setTimeout(() => setCopiedShipmentId(false), 2000);
    }
  };

  const orderRecipient = order ? extractOrderRecipient(order) : null;
  const recipient = shipment.recipient_address || {};
  const sender = shipment.sender_address || {};
  const parcel = shipment.parcel || {};

  // Resolve recipient name: if empty or 'Valued Customer', fallback to actual order recipient name
  const rawRecipientName = (recipient.name || '').trim();
  const effectiveRecipientName =
    rawRecipientName && rawRecipientName !== 'Valued Customer' ? rawRecipientName : orderRecipient?.name || 'Customer';

  // Resolve recipient phone: if dummy '5555555555' or empty, fallback to actual order recipient phone
  const rawRecipientPhone = (recipient.phone || '').trim();
  const effectiveRecipientPhone =
    rawRecipientPhone && rawRecipientPhone !== '5555555555' ? rawRecipientPhone : orderRecipient?.phone || '';

  const effectiveStreet1 = recipient.street1 || orderRecipient?.street1 || '';
  const effectiveStreet2 = recipient.street2 || orderRecipient?.street2 || '';
  const effectiveCity = recipient.city || orderRecipient?.city || '';
  const effectiveState = recipient.state || orderRecipient?.state || '';
  const effectiveZip = recipient.zip || orderRecipient?.zip || '';
  const effectiveCountry = recipient.country || orderRecipient?.country || 'US';

  const formattedCarrierService = formatCarrierService(shipment.carrier, shipment.service);

  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} shouldCloseOnOverlayClick={true}>
      <CustomModalLayout
        title={`Shipment Details — Order #${displayOrderNum}`}
        primaryButtonText={hasLabel ? 'Print / View Label (PDF)' : undefined}
        primaryButtonOnClick={hasLabel ? handlePrintLabel : undefined}
        secondaryButtonText='Close'
        secondaryButtonOnClick={onClose}
        onCloseButtonClick={onClose}
        width='720px'
      >
        <Box direction='vertical' gap='SP4'>
          {/* Top Hero: Tracking Number & Real-time Status */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '16px 20px',
            }}
          >
            <Box direction='vertical' gap='SP2'>
              <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                <Text size='tiny' weight='bold' secondary style={{ letterSpacing: '0.5px' }}>
                  TRACKING NUMBER
                </Text>
                <Box direction='horizontal' gap='SP2' verticalAlign='middle'>
                  <Badge
                    skin={
                      shipment.status === 'LABEL_PURCHASED' || shipment.status === 'MANIFESTED' ? 'success' : 'neutral'
                    }
                    size='small'
                  >
                    {shipment.status === 'LABEL_PURCHASED'
                      ? 'Postage Purchased'
                      : shipment.status === 'MANIFESTED'
                        ? 'Manifested'
                        : shipment.status}
                  </Badge>
                  {shipment.wix_fulfillment_id ? (
                    <Badge skin='success' size='small'>
                      Wix Fulfilled
                    </Badge>
                  ) : (
                    <Badge skin='warning' size='small'>
                      Wix Pending
                    </Badge>
                  )}
                </Box>
              </Box>

              <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <Text
                    weight='bold'
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '18px',
                      letterSpacing: '1px',
                      color: '#0f172a',
                    }}
                  >
                    {shipment.tracking_code || 'Pending Tracking Generation'}
                  </Text>
                </div>

                {shipment.tracking_code && (
                  <Button
                    size='tiny'
                    priority='secondary'
                    prefixIcon={copiedTracking ? <Check /> : <Duplicate />}
                    onClick={handleCopyTracking}
                  >
                    {copiedTracking ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </Box>
            </Box>
          </div>

          {/* Two-Column Grid: Delivery Route & Package Specifications */}
          <Layout>
            {/* Left Card: Delivery Route */}
            <Cell span={6}>
              <Card>
                <Card.Header title='Delivery Route' />
                <Card.Divider />
                <Card.Content>
                  <Box direction='vertical' gap='SP3'>
                    {/* Warehouse Origin */}
                    <Box direction='vertical' gap='SP1'>
                      <Text size='tiny' weight='bold' secondary style={{ letterSpacing: '0.5px' }}>
                        SHIPPED FROM (WAREHOUSE)
                      </Text>
                      <Text size='small' weight='bold' style={{ color: '#0f172a' }}>
                        {sender.name || 'Warehouse Dispatch'}
                      </Text>
                      {sender.company && (
                        <Text size='small' secondary>
                          {sender.company}
                        </Text>
                      )}
                      <Text size='small'>{sender.street1}</Text>
                      {sender.street2 && <Text size='small'>{sender.street2}</Text>}
                      <Text size='small'>
                        {sender.city}, {sender.state} {sender.zip}
                      </Text>
                      <Text size='small'>{sender.country || 'US'}</Text>
                    </Box>

                    <Divider />

                    {/* Recipient Destination */}
                    <Box direction='vertical' gap='SP1'>
                      <Text size='tiny' weight='bold' secondary style={{ letterSpacing: '0.5px' }}>
                        SHIPPED TO (RECIPIENT)
                      </Text>
                      <Text size='small' weight='bold' style={{ color: '#0f172a' }}>
                        {effectiveRecipientName}
                      </Text>
                      <Text size='small'>{effectiveStreet1}</Text>
                      {effectiveStreet2 && <Text size='small'>{effectiveStreet2}</Text>}
                      <Text size='small'>
                        {effectiveCity ? `${effectiveCity}, ` : ''}
                        {effectiveState} {effectiveZip}
                      </Text>
                      <Text size='small'>{effectiveCountry}</Text>
                      {effectiveRecipientPhone && (
                        <Text size='tiny' secondary>
                          Phone: {effectiveRecipientPhone}
                        </Text>
                      )}
                    </Box>
                  </Box>
                </Card.Content>
              </Card>
            </Cell>

            {/* Right Card: Postage & Parcel Specifications */}
            <Cell span={6}>
              <Card>
                <Card.Header title='Postage & Package Specs' />
                <Card.Divider />
                <Card.Content>
                  <Box direction='vertical' gap='SP3'>
                    {/* Carrier & Service */}
                    <Box direction='vertical' gap='SP1'>
                      <Text size='tiny' weight='bold' secondary style={{ letterSpacing: '0.5px' }}>
                        CARRIER & SERVICE
                      </Text>
                      <Text size='small' weight='bold' style={{ color: '#0f172a' }}>
                        {formattedCarrierService}
                      </Text>
                    </Box>

                    {/* Postage Cost */}
                    <Box direction='vertical' gap='SP1'>
                      <Text size='tiny' weight='bold' secondary style={{ letterSpacing: '0.5px' }}>
                        POSTAGE COST
                      </Text>
                      <Text size='medium' weight='bold' style={{ color: '#059669' }}>
                        ${(shipment.rate_amount || 0).toFixed(2)} {shipment.rate_currency || 'USD'}
                      </Text>
                    </Box>

                    <Divider />

                    {/* Weight */}
                    <Box direction='vertical' gap='SP1'>
                      <Text size='tiny' weight='bold' secondary style={{ letterSpacing: '0.5px' }}>
                        PACKAGE WEIGHT
                      </Text>
                      <Text size='small' weight='bold'>
                        {parcel.weight || 0} oz ({((parcel.weight || 0) / 16).toFixed(2)} lbs)
                      </Text>
                    </Box>

                    {/* Dimensions */}
                    <Box direction='vertical' gap='SP1'>
                      <Text size='tiny' weight='bold' secondary style={{ letterSpacing: '0.5px' }}>
                        DIMENSIONS (L × W × H)
                      </Text>
                      <Text size='small' weight='bold'>
                        {parcel.length || 0}″ × {parcel.width || 0}″ × {parcel.height || 0}″
                      </Text>
                    </Box>
                  </Box>
                </Card.Content>
              </Card>
            </Cell>
          </Layout>

          {/* Bottom Identifiers & Timestamps */}
          <Box direction='horizontal' align='space-between' verticalAlign='middle' padding='SP1 SP2'>
            <Box direction='horizontal' gap='SP1' verticalAlign='middle'>
              <Text size='tiny' secondary style={{ fontFamily: 'monospace' }}>
                EasyPost ID: {shipment.easypost_shipment_id || shipment.id}
              </Text>
              <Button
                size='tiny'
                priority='secondary'
                skin='inverted'
                onClick={handleCopyShipmentId}
                style={{ padding: '0 4px', height: '20px' }}
              >
                {copiedShipmentId ? 'Copied' : 'Copy'}
              </Button>
            </Box>
            {shipment.created_at && (
              <Text size='tiny' secondary>
                Purchased: {new Date(shipment.created_at).toLocaleString()}
              </Text>
            )}
          </Box>
        </Box>
      </CustomModalLayout>
    </Modal>
  );
}
