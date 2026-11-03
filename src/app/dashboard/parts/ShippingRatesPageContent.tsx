'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Breadcrumbs, Button, Loader, Page, Tabs } from '@wix/design-system';
import { useSDK } from '@/app/utils/wix-sdk.client-only';
import { ShippingAppData } from '@/app/types/app-data.model';
import { WixPageId } from '@/app/utils/navigation.const';
import { useSetShippingAppData, useShippingAppData } from '@/app/client-hooks/app-data';
import testIds from '@/app/utils/test-ids';
import { isTestingToken } from '@/app/utils/access-token';

import { OrdersTab } from '@/app/dashboard/parts/tabs/OrdersTab';
import { ShipmentsTab } from '@/app/dashboard/parts/tabs/ShipmentsTab';
import { ManifestsTab } from '@/app/dashboard/parts/tabs/ManifestsTab';
import { TrackingTab } from '@/app/dashboard/parts/tabs/TrackingTab';
import { SettingsTab } from '@/app/dashboard/parts/tabs/SettingsTab';

export const ShippingRatesPageContent = ({}: {}) => {
  const {
    dashboard: { showToast, navigate },
  } = useSDK();

  const persistShippingAppData = useSetShippingAppData();
  const { data: persistedShippingAppData, isLoading: isLoadingAppData } = useShippingAppData();
  const [currentShippingAppData, setCurrentShippingAppData] = useState<ShippingAppData | undefined>(
    persistedShippingAppData,
  );

  useEffect(() => {
    setCurrentShippingAppData(persistedShippingAppData);
  }, [persistedShippingAppData]);

  const [activeTab, setActiveTab] = useState<string>('orders');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const token = params.get('accessToken');
      if (tabParam) {
        setActiveTab(tabParam);
      } else if (token && isTestingToken(token)) {
        setActiveTab('settings');
      }
    }
  }, []);

  const [loading, setLoading] = useState(false);

  const onSave = useCallback(() => {
    if (!currentShippingAppData) return;
    setLoading(true);
    persistShippingAppData(currentShippingAppData)
      .then(() => {
        showToast({
          message: 'Settings saved successfully.',
          type: 'success',
        });
      })
      .catch(() => {
        showToast({
          message: 'Failed to save settings.',
          type: 'error',
        });
      })
      .finally(() => setLoading(false));
  }, [persistShippingAppData, currentShippingAppData, showToast]);

  const ButtonsBar = useCallback(
    () => (
      <Box gap='SP2'>
        <Button
          skin='standard'
          priority='secondary'
          onClick={() => setCurrentShippingAppData(persistedShippingAppData)}
        >
          Cancel
        </Button>
        <Button onClick={onSave}>{loading ? <Loader size='tiny' /> : 'Save'}</Button>
      </Box>
    ),
    [loading, onSave, persistedShippingAppData],
  );

  return (
    <Page height='100vh' dataHook={testIds.DASHBOARD.WRAPPER}>
      <Page.Header
        actionsBar={<ButtonsBar />}
        breadcrumbs={
          <Breadcrumbs
            activeId='2'
            items={[
              { id: WixPageId.MANAGE_APPS, value: 'Apps' },
              { id: 'shipping-app-page', value: 'EasyPost Integration', disabled: true },
            ]}
            onClick={({ id }) => navigate(id as string)}
          />
        }
        title='EasyPost Shipping & Fulfillment'
        subtitle='Multi-carrier live rates (USPS, FedEx, UPS, DHL), automated postage labels, SCAN forms, and package tracking.'
      />
      <Page.Content>
        {isLoadingAppData ? (
          <Box align='center' verticalAlign='middle' height='300px'>
            <Loader size='medium' />
          </Box>
        ) : (
          <Box direction='vertical' gap='SP4'>
            <Tabs
              activeId={activeTab}
              onClick={(tab) => setActiveTab(tab.id as string)}
              items={[
                { id: 'orders', title: 'Orders & Fulfillment' },
                { id: 'shipments', title: 'Shipments & Labels' },
                { id: 'manifests', title: 'SCAN Forms / Manifests' },
                { id: 'tracking', title: 'Live Tracking' },
                { id: 'settings', title: 'Carrier & API Settings' },
              ]}
            />

            {activeTab === 'orders' && <OrdersTab />}
            {activeTab === 'shipments' && <ShipmentsTab />}
            {activeTab === 'manifests' && <ManifestsTab />}
            {activeTab === 'tracking' && <TrackingTab />}
            {activeTab === 'settings' && (
              <SettingsTab currentAppData={currentShippingAppData} onAppDataChange={setCurrentShippingAppData} />
            )}
          </Box>
        )}
      </Page.Content>
    </Page>
  );
};
