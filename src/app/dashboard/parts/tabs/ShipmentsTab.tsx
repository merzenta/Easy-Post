'use client';

import React, { useState } from 'react';
import {
  Card,
  Table,
  Badge,
  Button,
  Box,
  Text,
  Loader,
  EmptyState,
  Modal,
  CustomModalLayout,
} from '@wix/design-system';
import { useShipments, useDeleteShipment } from '@/app/client-hooks/shipments';
import { useBuyLabel } from '@/app/client-hooks/labels';
import { useSDK } from '@/app/utils/wix-sdk.client-only';
import { EasyPostShipment, EasyPostShipmentStatus } from '@/app/types/easypost.model';
import { formatCarrierService } from '@/app/utils/rate-matcher';
import { ShipmentDetailsModal } from '@/app/dashboard/parts/modals/ShipmentDetailsModal';
import { QuotaExceededUpgradeModal } from '@/app/dashboard/parts/modals/QuotaExceededUpgradeModal';

export function ShipmentsTab() {
  const {
    dashboard: { showToast },
  } = useSDK();
  const { data: shipments = [], isLoading } = useShipments();
  const deleteShipment = useDeleteShipment();
  const buyLabel = useBuyLabel();

  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailsShipment, setDetailsShipment] = useState<EasyPostShipment | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState<EasyPostShipment | null>(null);

  const handlePrintLabel = (shipment: EasyPostShipment) => {
    if (shipment.label_url) {
      window.open(shipment.label_url, '_blank');
    } else {
      showToast({ message: 'No label URL available for this shipment.', type: 'warning' });
    }
  };

  const handleBuyLabel = async (shipment: EasyPostShipment) => {
    const rateId = shipment.rate_id || shipment.rates?.[0]?.id;
    if (!rateId) {
      showToast({ message: 'No carrier rate selected for this shipment.', type: 'error' });
      return;
    }

    setBuyingId(shipment.id);
    try {
      const bought = await buyLabel({
        shipmentId: shipment.id,
        rateId,
      });

      showToast({
        message: `Label purchased! Tracking: ${bought.tracking_code || 'Generated'}`,
        type: 'success',
      });

      if (bought.label_url) {
        window.open(bought.label_url, '_blank');
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Error';
      if (
        errMsg.includes('MONTHLY_LABEL_QUOTA_EXCEEDED') ||
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('limit reached')
      ) {
        setIsQuotaModalOpen(true);
      } else {
        showToast({
          message: `Failed to buy label: ${errMsg}`,
          type: 'error',
        });
      }
    } finally {
      setBuyingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!shipmentToDelete) return;

    setDeletingId(shipmentToDelete.id);
    try {
      await deleteShipment(shipmentToDelete.id);
      showToast({ message: 'Shipment draft removed.', type: 'success' });
      setShipmentToDelete(null);
    } catch (err: any) {
      showToast({
        message: `Failed to delete shipment: ${err?.message || 'Error'}`,
        type: 'error',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: EasyPostShipmentStatus) => {
    switch (status) {
      case 'MANIFESTED':
        return (
          <Badge skin='premium' size='small'>
            MANIFESTED
          </Badge>
        );
      case 'LABEL_PURCHASED':
        return (
          <Badge skin='success' size='small'>
            LABEL PURCHASED
          </Badge>
        );
      case 'LABEL_PENDING':
        return (
          <Badge skin='warning' size='small'>
            PENDING
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge skin='danger' size='small'>
            CANCELLED
          </Badge>
        );
      default:
        return (
          <Badge skin='neutral' size='small'>
            {status}
          </Badge>
        );
    }
  };

  return (
    <Box direction='vertical' gap='SP4'>
      <Card hideOverflow>
        <Card.Header
          title='EasyPost Shipments & Postage Labels'
          subtitle='Manage prepared shipments, view live carrier rates, and print postage labels.'
        />
        <Card.Divider />
        {isLoading ? (
          <Card.Content>
            <Box height='250px' verticalAlign='middle' align='center'>
              <Loader size='medium' />
            </Box>
          </Card.Content>
        ) : shipments.length === 0 ? (
          <Card.Content>
            <EmptyState
              title='No shipments created yet'
              subtitle="Fulfill store orders from the 'Orders & Fulfillment' tab to create EasyPost shipments."
            />
          </Card.Content>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <div style={{ minWidth: '1080px', width: '100%' }}>
              <Table
                data={shipments}
                columns={[
                  {
                    title: 'Tracking / Shipment ID',
                    render: (row) => (
                      <div
                        style={{
                          minWidth: 0,
                          maxWidth: '230px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        {row.tracking_code ? (
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <Text weight='bold' size='small' ellipsis title={`Tracking: ${row.tracking_code}`}>
                              {row.tracking_code}
                            </Text>
                          </div>
                        ) : (
                          <div>
                            <Badge skin='neutral' size='small'>
                              Unpurchased Draft
                            </Badge>
                          </div>
                        )}
                        <div
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '220px',
                          }}
                        >
                          <Text
                            size='tiny'
                            secondary
                            ellipsis
                            title={`EasyPost Shipment ID: ${row.easypost_shipment_id}`}
                          >
                            {row.easypost_shipment_id}
                          </Text>
                        </div>
                      </div>
                    ),
                    width: '240px',
                  },
                  {
                    title: 'Wix Order',
                    render: (row) => (
                      <div
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100px',
                        }}
                      >
                        <Text size='small' weight='bold' ellipsis title={`Wix Order: ${row.wix_order_id}`}>
                          #{row.wix_order_id ? row.wix_order_id.slice(0, 8) : 'N/A'}
                        </Text>
                      </div>
                    ),
                    width: '110px',
                  },
                  {
                    title: 'Carrier & Service',
                    render: (row) => (
                      <Text size='small' style={{ wordBreak: 'break-word' }}>
                        {formatCarrierService(row.carrier, row.service)}
                      </Text>
                    ),
                    width: '180px',
                  },
                  {
                    title: 'Recipient',
                    render: (row) => (
                      <Text size='small' style={{ wordBreak: 'break-word' }}>
                        {row.recipient_address.name} ({row.recipient_address.city}, {row.recipient_address.state})
                      </Text>
                    ),
                    width: '200px',
                  },
                  {
                    title: 'Cost',
                    render: (row) => (
                      <Text size='small' weight='bold'>
                        ${row.rate_amount?.toFixed(2)} {row.rate_currency}
                      </Text>
                    ),
                    width: '100px',
                  },
                  {
                    title: 'Status',
                    render: (row) => getStatusBadge(row.status),
                    width: '130px',
                  },
                  {
                    title: 'Actions',
                    render: (row) => {
                      const isPurchased = row.status === 'LABEL_PURCHASED' || row.status === 'MANIFESTED';
                      return (
                        <Box gap='SP1' verticalAlign='middle'>
                          {isPurchased ? (
                            <>
                              <Button size='tiny' priority='primary' onClick={() => handlePrintLabel(row)}>
                                Print Label
                              </Button>
                              <Button
                                size='tiny'
                                priority='secondary'
                                onClick={() => {
                                  setDetailsShipment(row);
                                  setIsDetailsOpen(true);
                                }}
                              >
                                View Details
                              </Button>
                            </>
                          ) : (
                            <Button
                              size='tiny'
                              priority='primary'
                              disabled={buyingId === row.id}
                              onClick={() => handleBuyLabel(row)}
                            >
                              {buyingId === row.id ? 'Buying...' : 'Buy Label'}
                            </Button>
                          )}
                          {!isPurchased && (
                            <Button
                              size='tiny'
                              skin='destructive'
                              priority='secondary'
                              disabled={deletingId === row.id}
                              onClick={() => setShipmentToDelete(row)}
                            >
                              {deletingId === row.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          )}
                        </Box>
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

      {/* Delete Confirmation Modal (Wix Native UI) */}
      {shipmentToDelete && (
        <Modal
          isOpen={Boolean(shipmentToDelete)}
          onRequestClose={() => setShipmentToDelete(null)}
          shouldCloseOnOverlayClick={true}
        >
          <CustomModalLayout
            title='Delete Shipment Draft'
            primaryButtonText={deletingId ? 'Deleting...' : 'Delete Shipment'}
            primaryButtonOnClick={handleConfirmDelete}
            secondaryButtonText='Cancel'
            secondaryButtonOnClick={() => setShipmentToDelete(null)}
            onCloseButtonClick={() => setShipmentToDelete(null)}
            width='500px'
          >
            <Box direction='vertical' gap='SP2'>
              <Text>
                Are you sure you want to remove shipment draft <strong>{shipmentToDelete.easypost_shipment_id}</strong>?
              </Text>
              <Text size='small' secondary>
                This will delete the unpurchased draft shipment. You can recreate it at any time from Store Orders.
              </Text>
            </Box>
          </CustomModalLayout>
        </Modal>
      )}

      {/* Shipment Details Modal */}
      {isDetailsOpen && detailsShipment && (
        <ShipmentDetailsModal
          isOpen={isDetailsOpen}
          shipment={detailsShipment}
          orderNumber={detailsShipment.wix_order_id ? detailsShipment.wix_order_id.slice(0, 8) : undefined}
          onClose={() => {
            setIsDetailsOpen(false);
            setDetailsShipment(null);
          }}
        />
      )}

      {/* Quota Exceeded Upgrade Modal */}
      <QuotaExceededUpgradeModal isOpen={isQuotaModalOpen} onClose={() => setIsQuotaModalOpen(false)} />
    </Box>
  );
}
