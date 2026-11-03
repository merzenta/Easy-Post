'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  Box,
  Text,
  FormField,
  Input,
  Dropdown,
  Checkbox,
  Button,
  Layout,
  Cell,
  Loader,
} from '@wix/design-system';
import {
  useMerchantSettings,
  useSaveMerchantSettings,
  useValidateEasyPostKey,
} from '@/app/client-hooks/merchant-settings';
import { useSDK } from '@/app/utils/wix-sdk.client-only';
import { ShippingAppData, MerchantSettings } from '@/app/types/app-data.model';

export function SettingsTab({
  currentAppData,
  onAppDataChange,
  shippingAppData,
  onShippingAppDataChange,
  onSaveAppData,
  isSaving,
}: {
  currentAppData?: ShippingAppData;
  onAppDataChange?: (updated: ShippingAppData) => void;
  shippingAppData?: ShippingAppData;
  onShippingAppDataChange?: (updated: ShippingAppData) => void;
  onSaveAppData?: () => void;
  isSaving?: boolean;
}) {
  const {
    dashboard: { showToast },
  } = useSDK();
  const { data: persistedSettings, isLoading: isLoadingSettings } = useMerchantSettings();
  const saveSettings = useSaveMerchantSettings();
  const validateApiKey = useValidateEasyPostKey();

  const [settings, setSettings] = useState<Partial<MerchantSettings>>({});
  const [verifying, setVerifying] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (persistedSettings) {
      setSettings(persistedSettings);
    }
  }, [persistedSettings]);

  const handleVerify = async () => {
    if (!settings.apiKey) {
      showToast({ message: 'Please enter an EasyPost API key first', type: 'error' });
      return;
    }
    setVerifying(true);
    try {
      const res = await validateApiKey(settings.apiKey);
      if (res.valid) {
        showToast({
          message: `API Key verified successfully! Connected as: ${res.user || 'EasyPost Merchant'}`,
          type: 'success',
        });
      } else {
        showToast({
          message: `Verification failed: ${res.error || 'Invalid credentials'}`,
          type: 'error',
        });
      }
    } catch (err: any) {
      showToast({
        message: `Verification error: ${err?.message || 'Error'}`,
        type: 'error',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await saveSettings(settings);
      if (onSaveAppData) onSaveAppData();
      showToast({
        message: 'EasyPost settings saved successfully.',
        type: 'success',
      });
    } catch (err: any) {
      showToast({
        message: `Failed to save settings: ${err?.message || 'Error'}`,
        type: 'error',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleCarrier = (carrier: string) => {
    const current = settings.enabledCarriers || ['USPS', 'FedEx', 'UPS', 'DHL'];
    const updated = current.includes(carrier) ? current.filter((c) => c !== carrier) : [...current, carrier];
    setSettings({ ...settings, enabledCarriers: updated });
  };

  if (isLoadingSettings) {
    return (
      <Box align='center' verticalAlign='middle' height='200px'>
        <Loader size='medium' />
      </Box>
    );
  }

  return (
    <Layout>
      {/* 1. EasyPost API Credentials */}
      <Cell span={12}>
        <Card>
          <Card.Header
            title='EasyPost API Credentials'
            subtitle='Connect your EasyPost account to fetch live rates and purchase postage labels.'
            suffix={
              <Button
                skin='standard'
                priority='secondary'
                size='small'
                onClick={handleVerify}
                disabled={verifying || !settings.apiKey}
              >
                {verifying ? <Loader size='tiny' /> : 'Verify API Key'}
              </Button>
            }
          />
          <Card.Divider />
          <Card.Content>
            <Layout>
              <Cell span={4}>
                <FormField label='Environment'>
                  <Dropdown
                    selectedId={settings.environment || 'TEST'}
                    options={[
                      { id: 'TEST', value: 'Test Mode (Sandbox / Test Key)' },
                      { id: 'PRODUCTION', value: 'Production (Live Postage Labels)' },
                    ]}
                    onSelect={(option) => setSettings({ ...settings, environment: option.id as 'TEST' | 'PRODUCTION' })}
                  />
                </FormField>
              </Cell>
              <Cell span={5}>
                <FormField
                  label='EasyPost API Key'
                  infoContent='Use EZTK... for test mode or EZAK... for production.'
                  required
                >
                  <Input
                    type='password'
                    placeholder='EZTK... or EZAK...'
                    value={settings.apiKey || ''}
                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  />
                </FormField>
              </Cell>
              <Cell span={3}>
                <FormField label='Default Label Format'>
                  <Dropdown
                    selectedId={settings.defaultLabelFormat || 'PDF'}
                    options={[
                      { id: 'PDF', value: 'PDF (Standard A4 / 4x6)' },
                      { id: 'PNG', value: 'PNG (Image)' },
                      { id: 'ZPL', value: 'ZPL (Zebra Thermal)' },
                      { id: 'EPL2', value: 'EPL2 (Eltron Thermal)' },
                    ]}
                    onSelect={(option) =>
                      setSettings({
                        ...settings,
                        defaultLabelFormat: option.id as any,
                      })
                    }
                  />
                </FormField>
              </Cell>
            </Layout>
          </Card.Content>
        </Card>
      </Cell>

      {/* 2. Enabled Carriers */}
      <Cell span={12}>
        <Card>
          <Card.Header
            title='Enabled Shipping Carriers'
            subtitle='Select which carriers to offer at checkout. Rates from disabled carriers will be filtered out.'
          />
          <Card.Divider />
          <Card.Content>
            <Box gap='SP4' direction='horizontal'>
              {['USPS', 'FedEx', 'UPS', 'DHL'].map((carrier) => (
                <Checkbox
                  key={carrier}
                  checked={(settings.enabledCarriers || []).includes(carrier)}
                  onChange={() => toggleCarrier(carrier)}
                >
                  {carrier}
                </Checkbox>
              ))}
            </Box>
          </Card.Content>
        </Card>
      </Cell>

      {/* 3. Origin Warehouse Address */}
      <Cell span={12}>
        <Card>
          <Card.Header
            title='Dispatch Warehouse Location'
            subtitle='Origin address used to compute live carrier shipping rates.'
          />
          <Card.Divider />
          <Card.Content>
            <Layout>
              <Cell span={6}>
                <FormField label='Contact / Sender Name'>
                  <Input
                    value={settings.merchantLocation?.name || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          name: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={6}>
                <FormField label='Company / Business Name'>
                  <Input
                    value={settings.merchantLocation?.company || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          company: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={6}>
                <FormField label='Street Address' required>
                  <Input
                    value={settings.merchantLocation?.street1 || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          street1: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={6}>
                <FormField label='Apartment / Suite / Unit'>
                  <Input
                    value={settings.merchantLocation?.street2 || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          street2: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={4}>
                <FormField label='City' required>
                  <Input
                    value={settings.merchantLocation?.city || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          city: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={4}>
                <FormField label='State / Province' required>
                  <Input
                    value={settings.merchantLocation?.state || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          state: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={4}>
                <FormField label='ZIP / Postal Code' required>
                  <Input
                    value={settings.merchantLocation?.zip || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          zip: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={6}>
                <FormField label='Country Code (e.g. US, CA, AU)'>
                  <Input
                    value={settings.merchantLocation?.country || 'US'}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          country: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={6}>
                <FormField label='Phone'>
                  <Input
                    value={settings.merchantLocation?.phone || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchantLocation: {
                          ...(settings.merchantLocation as any),
                          phone: e.target.value,
                        },
                      })
                    }
                  />
                </FormField>
              </Cell>
            </Layout>
          </Card.Content>
        </Card>
      </Cell>

      {/* 4. Pricing Controls & Emergency Fallback */}
      <Cell span={12}>
        <Card>
          <Card.Header
            title='Pricing Rules & Fallback'
            subtitle='Configure handling surcharges, free shipping threshold, and fallback rate.'
          />
          <Card.Divider />
          <Card.Content>
            <Layout>
              <Cell span={4}>
                <FormField label='Handling Fee Type'>
                  <Dropdown
                    selectedId={settings.handlingFeeType || 'NONE'}
                    options={[
                      { id: 'NONE', value: 'None' },
                      { id: 'FLAT', value: 'Flat Surcharge ($)' },
                      { id: 'PERCENTAGE', value: 'Percentage Markup (%)' },
                    ]}
                    onSelect={(option) =>
                      setSettings({
                        ...settings,
                        handlingFeeType: option.id as any,
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={4}>
                <FormField label='Handling Fee Amount'>
                  <Input
                    type='number'
                    value={String(settings.handlingFeeValue ?? 0)}
                    onChange={(e) => setSettings({ ...settings, handlingFeeValue: parseFloat(e.target.value) || 0 })}
                  />
                </FormField>
              </Cell>
              <Cell span={4}>
                <FormField label='Free Shipping Over ($)'>
                  <Input
                    type='number'
                    placeholder='Leave empty to disable'
                    value={settings.freeShippingThreshold !== undefined ? String(settings.freeShippingThreshold) : ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        freeShippingThreshold: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                  />
                </FormField>
              </Cell>
              <Cell span={6}>
                <FormField
                  label='Fallback Rate ($)'
                  infoContent='Used if EasyPost API is temporarily unreachable or carrier is down'
                >
                  <Input
                    type='number'
                    value={String(settings.fallbackRate ?? 10.0)}
                    onChange={(e) => setSettings({ ...settings, fallbackRate: parseFloat(e.target.value) || 10.0 })}
                  />
                </FormField>
              </Cell>
              <Cell span={6}>
                <FormField label='Default Item Weight (oz)'>
                  <Input
                    type='number'
                    value={String(settings.defaultItemWeightOz ?? 16.0)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        defaultItemWeightOz: parseFloat(e.target.value) || 16.0,
                      })
                    }
                  />
                </FormField>
              </Cell>
            </Layout>
          </Card.Content>
        </Card>
      </Cell>

      {/* Save Settings Button */}
      <Cell span={12}>
        <Box align='right' gap='SP2'>
          <Button onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? <Loader size='tiny' /> : 'Save EasyPost Configuration'}
          </Button>
        </Box>
      </Cell>
    </Layout>
  );
}
