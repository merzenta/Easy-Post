'use client';

import React, { useState, useMemo } from 'react';
import { Card, Table, Badge, Button, Box, Text, Loader, EmptyState } from '@wix/design-system';
import { useSearchOrders } from '@/app/client-hooks/wix-orders';
import { useShipments, useSyncOrderFulfillment } from '@/app/client-hooks/shipments';
import { useSDK } from '@/app/utils/wix-sdk.client-only';
import { ShipmentPreparationModal, ShipmentModalOrder } from '@/app/dashboard/parts/modals/ShipmentPreparationModal';
import { ShipmentDetailsModal } from '@/app/dashboard/parts/modals/ShipmentDetailsModal';
import { extractOrderRecipient } from '@/app/utils/address-helper';
import { formatCarrierService } from '@/app/utils/rate-matcher';
import { EasyPostShipment } from '@/app/types/easypost.model';

export function OrdersTab() {
  const { data: ordersData, isLoading: isOrdersLoading } = useSearchOrders(50);
  const { data: shipments = [], isLoading: isShipmentsLoading } = useShipments();
  const {
    dashboard: { showToast },
  } = useSDK();
  const syncOrderFulfillment = useSyncOrderFulfillment();

  const [selectedOrder, setSelectedOrder] = useState<ShipmentModalOrder | null>(null);
  const [isFulfillModalOpen, setIsFulfillModalOpen] = useState(false);
  const [syncingOrderId, setSyncingOrderId] = useState<string | null>(null);

  // Shipment Details Modal State
  const [detailsShipment, setDetailsShipment] = useState<EasyPostShipment | null>(null);
  const [detailsOrderNumber, setDetailsOrderNumber] = useState<string>('');
  const [detailsOrder, setDetailsOrder] = useState<any>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const orders = ordersData?.orders || [];
  const isLoading = isOrdersLoading || isShipmentsLoading;

  // Index shipments by wix_order_id for O(1) row lookup
  const shipmentsByOrderId = useMemo(() => {
    const map = new Map<string, EasyPostShipment>();
    (shipments || []).forEach((s) => {
      if (s.wix_order_id) {
        const existing = map.get(s.wix_order_id);
        // Prioritize shipments with active label_url
        if (!existing || (s.status === 'LABEL_PURCHASED' && s.label_url)) {
          map.set(s.wix_order_id, s);
        }
      }
    });
    return map;
  }, [shipments]);

  const handleOpenFulfillModal = (order: any) => {
    const normalized = {
      ...order,
      _id: order._id || order.id,
      id: order._id || order.id,
    };
    setSelectedOrder(normalized);
    setIsFulfillModalOpen(true);
  };

  const handleOpenDetailsModal = (shipment: EasyPostShipment, orderNumber: string, rawOrder?: any) => {
    setDetailsShipment(shipment);
    setDetailsOrderNumber(orderNumber);
    setDetailsOrder(rawOrder || null);
    setIsDetailsModalOpen(true);
  };

  const handlePrintLabel = (labelUrl: string) => {
    if (labelUrl) {
      window.open(labelUrl, '_blank');
    }
  };

  const handleSyncFulfillment = async (row: any) => {
    if (!row.matchedShipment?.id || !row.id) return;
    setSyncingOrderId(row.id);
    try {
      const res = await syncOrderFulfillment({
        orderId: row.id,
        shipmentId: row.matchedShipment.id,
        lineItems: [],
      });
      if (res.success) {
        showToast({
          message: `Order #${row.number} marked as fulfilled in Wix!`,
          type: 'success',
        });
      } else {
        showToast({
          message: `Fulfillment sync failed: ${res.error || 'Unknown error'}`,
          type: 'error',
        });
      }
    } catch (err: any) {
      showToast({
        message: `Fulfillment error: ${err?.message || 'Unknown error'}`,
        type: 'error',
      });
    } finally {
      setSyncingOrderId(null);
    }
  };

  const tableData = orders.map((order: any) => {
    const recipient = extractOrderRecipient(order);
    const recipientName = recipient.name;

    const location =
      recipient.city || recipient.state
        ? `${recipient.city}${recipient.city && recipient.state ? ', ' : ''}${recipient.state} ${recipient.zip} (${recipient.country})`.trim()
        : 'Standard Destination';

    const orderTotal = order.priceSummary?.total?.amount
      ? `$${parseFloat(order.priceSummary.total.amount).toFixed(2)}`
      : '$0.00';

    const orderId = order._id || order.id;
    const orderNumber = order.number || orderId?.slice(0, 8);

    // Check if shipment and label exist for this order
    const matchedShipment =
      (order._id && shipmentsByOrderId.get(order._id)) ||
      (order.id && shipmentsByOrderId.get(order.id)) ||
      (order.number && shipmentsByOrderId.get(order.number)) ||
      (shipments || []).find(
        (s) =>
          s.status === 'LABEL_PURCHASED' &&
          s.label_url &&
          (!s.wix_order_id || s.wix_order_id === orderId) &&
          (s.recipient_address?.street1 === recipient.street1 ||
            (s.recipient_address?.zip === recipient.zip && recipient.zip)),
      );

    const hasLabel = Boolean(matchedShipment?.label_url && matchedShipment?.status === 'LABEL_PURCHASED');

    const fulfillmentStatus = order.fulfillmentStatus || 'UNFULFILLED';
    const isFulfilled = fulfillmentStatus === 'FULFILLED' || hasLabel;

    const rawShippingTitle = order.shippingInfo?.title || 'Standard Shipping';
    const parts = rawShippingTitle.split('—').map((s: string) => s.trim());
    const formattedShippingTitle =
      parts.length === 2 ? formatCarrierService(parts[0], parts[1]) : formatCarrierService(undefined, rawShippingTitle);
    const shippingCost = order.shippingInfo?.cost?.price || order.priceSummary?.shipping?.amount;
    const formattedCost =
      shippingCost && parseFloat(shippingCost) > 0 ? ` ($${parseFloat(shippingCost).toFixed(2)})` : '';
    const shippingMethod = `${formattedShippingTitle}${formattedCost}`;

    return {
      id: orderId,
      number: orderNumber,
      createdDate: order._createdDate
        ? new Date(order._createdDate).toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Recent',
      customer: recipientName,
      location,
      total: orderTotal,
      shippingMethod,
      fulfillmentStatus,
      isFulfilled,
      hasLabel,
      matchedShipment,
      rawOrder: order,
    };
  });

  return (
    <Box direction='vertical' gap='SP4'>
      <Card hideOverflow>
        <Card.Header
          title='Store Orders & EasyPost Lodgement'
          subtitle='Select store orders to pack into parcels, compare live carrier rates, and print postage labels.'
        />
        <Card.Divider />
        {isLoading ? (
          <Card.Content>
            <Box height='250px' verticalAlign='middle' align='center'>
              <Loader size='medium' />
            </Box>
          </Card.Content>
        ) : tableData.length === 0 ? (
          <Card.Content>
            <EmptyState
              title='No store orders found'
              subtitle='When customers purchase from your Wix Store, orders will appear here ready for EasyPost fulfillment.'
            />
          </Card.Content>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <div style={{ minWidth: '1080px', width: '100%' }}>
              <Table
                data={tableData}
                columns={[
                  {
                    title: 'Order #',
                    render: (row) => <Text weight='bold'>#{row.number}</Text>,
                    width: '85px',
                  },
                  {
                    title: 'Date',
                    render: (row) => <Text size='small'>{row.createdDate}</Text>,
                    width: '100px',
                  },
                  {
                    title: 'Customer',
                    render: (row) => (
                      <div
                        style={{
                          minWidth: 0,
                          maxWidth: '125px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Text size='small' ellipsis title={row.customer}>
                          {row.customer}
                        </Text>
                      </div>
                    ),
                    width: '130px',
                  },
                  {
                    title: 'Destination',
                    render: (row) => (
                      <div style={{ minWidth: 0, maxWidth: '165px', overflow: 'hidden', wordBreak: 'break-word' }}>
                        <Text size='small' style={{ wordBreak: 'break-word' }}>
                          {row.location}
                        </Text>
                      </div>
                    ),
                    width: '170px',
                  },
                  {
                    title: 'Shipping Option',
                    render: (row) => (
                      <div style={{ minWidth: 0, maxWidth: '175px', overflow: 'hidden', wordBreak: 'break-word' }}>
                        <Text size='small' style={{ wordBreak: 'break-word' }}>
                          {row.shippingMethod}
                        </Text>
                      </div>
                    ),
                    width: '180px',
                  },
                  {
                    title: 'Total',
                    render: (row) => (
                      <Text size='small' weight='bold'>
                        {row.total}
                      </Text>
                    ),
                    width: '85px',
                  },
                  {
                    title: 'Status',
                    render: (row) => {
                      if (row.hasLabel) {
                        return (
                          <Badge skin='success' size='small'>
                            {row.matchedShipment?.carrier ? `${row.matchedShipment.carrier} Labeled` : 'Labeled'}
                          </Badge>
                        );
                      }
                      return (
                        <Badge skin={row.isFulfilled ? 'success' : 'warning'} size='small'>
                          {row.isFulfilled ? 'Fulfilled' : 'Unfulfilled'}
                        </Badge>
                      );
                    },
                    width: '130px',
                  },
                  {
                    title: 'Action',
                    render: (row) => {
                      if (row.hasLabel && row.matchedShipment?.label_url) {
                        return (
                          <Box gap='SP1' verticalAlign='middle'>
                            <Button
                              size='tiny'
                              priority='primary'
                              onClick={() => handlePrintLabel(row.matchedShipment!.label_url!)}
                            >
                              Print Label
                            </Button>
                            <Button
                              size='tiny'
                              priority='secondary'
                              onClick={() => handleOpenDetailsModal(row.matchedShipment!, row.number, row.rawOrder)}
                            >
                              View Details
                            </Button>
                            {row.fulfillmentStatus !== 'FULFILLED' && !row.matchedShipment.wix_fulfillment_id && (
                              <Button
                                size='tiny'
                                priority='secondary'
                                skin='standard'
                                disabled={syncingOrderId === row.id}
                                onClick={() => handleSyncFulfillment(row)}
                              >
                                {syncingOrderId === row.id ? 'Syncing...' : 'Sync Wix'}
                              </Button>
                            )}
                          </Box>
                        );
                      }

                      return (
                        <Button size='tiny' priority='primary' onClick={() => handleOpenFulfillModal(row.rawOrder)}>
                          Create Shipment
                        </Button>
                      );
                    },
                    width: '180px',
                  },
                ]}
              >
                <Table.Content />
              </Table>
            </div>
          </div>
        )}
      </Card>

      {/* Shipment Preparation / Purchase Modal */}
      {isFulfillModalOpen && selectedOrder && (
        <ShipmentPreparationModal
          isOpen={isFulfillModalOpen}
          order={selectedOrder}
          onClose={() => {
            setIsFulfillModalOpen(false);
            setSelectedOrder(null);
          }}
        />
      )}

      {/* Shipment Details Modal */}
      {isDetailsModalOpen && detailsShipment && (
        <ShipmentDetailsModal
          isOpen={isDetailsModalOpen}
          shipment={detailsShipment}
          orderNumber={detailsOrderNumber}
          order={detailsOrder}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setDetailsShipment(null);
            setDetailsOrder(null);
          }}
        />
      )}
    </Box>
  );
}
