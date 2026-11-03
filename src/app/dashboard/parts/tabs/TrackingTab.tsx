'use client';

import React, { useState } from 'react';
import { Card, Table, Badge, Button, Box, Text, Input, FormField, Loader, EmptyState } from '@wix/design-system';
import { useShipments } from '@/app/client-hooks/shipments';
import { useTrackShipment } from '@/app/client-hooks/tracking';
import { useSDK } from '@/app/utils/wix-sdk.client-only';

export function TrackingTab() {
  const {
    dashboard: { showToast },
  } = useSDK();
  const { data: shipments = [], isLoading } = useShipments();
  const trackShipment = useTrackShipment();
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingCode, setUpdatingCode] = useState<string | null>(null);

  const filtered = shipments.filter((s) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const trackingCode = s.tracking_code?.toLowerCase() || '';
    const shipmentId = s.easypost_shipment_id?.toLowerCase() || '';
    const orderId = s.wix_order_id?.toLowerCase() || '';
    const customer = s.recipient_address?.name?.toLowerCase() || '';
    return (
      trackingCode.includes(query) || shipmentId.includes(query) || orderId.includes(query) || customer.includes(query)
    );
  });

  const handleOpenEasyPostTracker = (trackingCode: string) => {
    window.open(`https://track.easypost.com/${encodeURIComponent(trackingCode)}`, '_blank');
  };

  const handleRefreshTracking = async (trackingCode: string, carrier?: string) => {
    setUpdatingCode(trackingCode);
    try {
      const res = await trackShipment({ trackingCode, carrier });
      showToast({
        message: `Tracking status updated: ${res.status.toUpperCase()}`,
        type: 'success',
      });
    } catch (err: any) {
      showToast({
        message: `Failed to refresh tracking: ${err?.message || 'Error'}`,
        type: 'error',
      });
    } finally {
      setUpdatingCode(null);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return (
          <Badge skin='success' size='small'>
            DELIVERED
          </Badge>
        );
      case 'in_transit':
        return (
          <Badge skin='standard' size='small'>
            IN TRANSIT
          </Badge>
        );
      case 'out_for_delivery':
        return (
          <Badge skin='warning' size='small'>
            OUT FOR DELIVERY
          </Badge>
        );
      case 'failure':
      case 'return_to_sender':
        return (
          <Badge skin='danger' size='small'>
            EXCEPTION
          </Badge>
        );
      case 'pre_transit':
      default:
        return (
          <Badge skin='neutral' size='small'>
            PRE TRANSIT
          </Badge>
        );
    }
  };

  return (
    <Box direction='vertical' gap='SP4'>
      <Card>
        <Card.Header
          title='Live Tracking & Delivery Status'
          subtitle='Real-time carrier tracking powered by EasyPost SmartTracker.'
          suffix={
            <Box width='300px'>
              <FormField label=''>
                <Input
                  placeholder='Search tracking #, order, customer...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  clearButton
                  onClear={() => setSearchQuery('')}
                />
              </FormField>
            </Box>
          }
        />
        <Card.Divider />
        {isLoading ? (
          <Card.Content>
            <Box height='250px' verticalAlign='middle' align='center'>
              <Loader size='medium' />
            </Box>
          </Card.Content>
        ) : filtered.length === 0 ? (
          <Card.Content>
            <EmptyState
              title='No tracked shipments found'
              subtitle={
                searchQuery
                  ? 'Try adjusting your search query.'
                  : 'Created shipments will appear here with instant tracking links.'
              }
            />
          </Card.Content>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <div style={{ minWidth: '950px', width: '100%' }}>
              <Table
                data={filtered}
                columns={[
                  {
                    title: 'Tracking Code',
                    render: (row) => (
                      <div
                        style={{
                          minWidth: 0,
                          maxWidth: '240px',
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                        }}
                      >
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Text weight='bold' size='small' ellipsis title={row.tracking_code || 'Pending Purchase'}>
                            {row.tracking_code || 'Pending Purchase'}
                          </Text>
                        </div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Text size='tiny' secondary ellipsis title={`${row.carrier} — ${row.service}`}>
                            {row.carrier} — {row.service}
                          </Text>
                        </div>
                      </div>
                    ),
                    width: '250px',
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
                    title: 'Recipient',
                    render: (row) => (
                      <Text size='small' style={{ wordBreak: 'break-word' }}>
                        {row.recipient_address.name} ({row.recipient_address.city}, {row.recipient_address.state})
                      </Text>
                    ),
                  },
                  {
                    title: 'Carrier',
                    render: (row) => <Text size='small'>{row.carrier}</Text>,
                    width: '100px',
                  },
                  {
                    title: 'Status',
                    render: (row) => getStatusBadge(row.status === 'LABEL_PURCHASED' ? 'in_transit' : row.status),
                    width: '140px',
                  },
                  {
                    title: 'Actions',
                    render: (row) => {
                      const hasCode = Boolean(row.tracking_code);
                      return (
                        <Box gap='SP2'>
                          <Button
                            size='tiny'
                            priority='secondary'
                            disabled={!hasCode}
                            onClick={() => row.tracking_code && handleOpenEasyPostTracker(row.tracking_code)}
                          >
                            View Tracker
                          </Button>
                          <Button
                            size='tiny'
                            priority='secondary'
                            disabled={!hasCode || updatingCode === row.tracking_code}
                            onClick={() => row.tracking_code && handleRefreshTracking(row.tracking_code, row.carrier)}
                          >
                            {updatingCode === row.tracking_code ? 'Updating...' : 'Refresh'}
                          </Button>
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
    </Box>
  );
}
