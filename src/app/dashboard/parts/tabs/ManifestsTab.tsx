'use client';

import React, { useState } from 'react';
import { Card, Table, Badge, Button, Box, Text, Loader, EmptyState } from '@wix/design-system';
import { useShipments } from '@/app/client-hooks/shipments';
import { useManifests, useCreateManifest } from '@/app/client-hooks/manifests';
import { useSDK } from '@/app/utils/wix-sdk.client-only';

export function ManifestsTab() {
  const {
    dashboard: { showToast },
  } = useSDK();
  const { data: shipments = [], isLoading: isLoadingShipments } = useShipments();
  const { data: scanForms = [], isLoading: isLoadingManifests } = useManifests();
  const createScanForm = useCreateManifest();

  const [manifesting, setManifesting] = useState(false);

  // Ready to manifest: labeled shipments that are unmanifested
  const readyShipments = shipments.filter((s) => s.status === 'LABEL_PURCHASED' && !s.scan_form_id);

  const readyParcelCount = readyShipments.length;

  const handleCreateScanForm = async () => {
    if (readyShipments.length === 0) return;
    setManifesting(true);
    try {
      const res = await createScanForm(readyShipments.map((s) => s.id));

      showToast({
        message: `EasyPost SCAN Form ${res.easypost_scan_form_id} created successfully!`,
        type: 'success',
      });

      if (res.form_url) {
        window.open(res.form_url, '_blank');
      }
    } catch (err: any) {
      showToast({
        message: `Failed to create SCAN Form: ${err?.message || 'Error'}`,
        type: 'error',
      });
    } finally {
      setManifesting(false);
    }
  };

  return (
    <Box direction='vertical' gap='SP5'>
      {/* Top Section: Today's Dispatch Queue */}
      <Card>
        <Card.Header
          title="Today's Dispatch Queue (Awaiting SCAN Form)"
          subtitle='Consolidate purchased shipping labels into a single barcode SCAN document for driver pickup.'
        />
        <Card.Divider />
        <Card.Content>
          <Box direction='vertical' gap='SP4'>
            <Box gap='SP6' verticalAlign='middle'>
              <Box direction='vertical'>
                <Text size='tiny' secondary>
                  UNMANIFESTED SHIPMENTS
                </Text>
                <Text size='medium' weight='bold'>
                  {isLoadingShipments ? '...' : readyParcelCount}
                </Text>
              </Box>

              <Box flex='1' />

              <Button
                priority='primary'
                size='medium'
                disabled={readyParcelCount === 0 || manifesting}
                onClick={handleCreateScanForm}
              >
                {manifesting ? 'Generating SCAN Form...' : `Create SCAN Form (${readyParcelCount})`}
              </Button>
            </Box>

            {readyParcelCount === 0 && !isLoadingShipments && (
              <Text size='small' secondary>
                All purchased shipments have been included in a SCAN form, or no labels are currently pending manifest.
              </Text>
            )}
          </Box>
        </Card.Content>
      </Card>

      {/* Bottom Section: SCAN Form History */}
      <Card hideOverflow>
        <Card.Header
          title='End-of-Day SCAN Form History'
          subtitle='Download printable barcode driver manifest sheets for past carrier handoffs.'
        />
        <Card.Divider />
        {isLoadingManifests ? (
          <Card.Content>
            <Box height='200px' verticalAlign='middle' align='center'>
              <Loader size='medium' />
            </Box>
          </Card.Content>
        ) : scanForms.length === 0 ? (
          <Card.Content>
            <EmptyState
              title='No SCAN forms generated yet'
              subtitle='When you manifest shipments for carrier pickup, the generated documents will be saved here.'
            />
          </Card.Content>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <Table
              data={scanForms}
              columns={[
                {
                  title: 'Date',
                  render: (row) => (
                    <Text size='small'>
                      {new Date(row.created_at).toLocaleDateString('en-US', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  ),
                  width: '180px',
                },
                {
                  title: 'SCAN Form ID',
                  render: (row) => (
                    <div style={{ minWidth: 0, maxWidth: '340px', overflow: 'hidden' }}>
                      <Text weight='bold' size='small' ellipsis title={row.easypost_scan_form_id}>
                        {row.easypost_scan_form_id}
                      </Text>
                    </div>
                  ),
                  width: '350px',
                },
                {
                  title: 'Shipments',
                  render: (row) => (
                    <Text size='small'>
                      {row.shipment_count} {row.shipment_count === 1 ? 'item' : 'items'}
                    </Text>
                  ),
                  width: '120px',
                },
                {
                  title: 'Status',
                  render: (row) => (
                    <Badge skin={row.status === 'created' ? 'success' : 'danger'} size='small'>
                      {row.status.toUpperCase()}
                    </Badge>
                  ),
                  width: '120px',
                },
                {
                  title: 'Actions',
                  render: (row) => (
                    <Button
                      size='tiny'
                      priority='secondary'
                      disabled={!row.form_url}
                      onClick={() => row.form_url && window.open(row.form_url, '_blank')}
                    >
                      Download Document
                    </Button>
                  ),
                  width: '180px',
                },
              ]}
            >
              <Table.Content />
            </Table>
          </div>
        )}
      </Card>
    </Box>
  );
}
