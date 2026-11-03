'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  CustomModalLayout,
  FormField,
  Input,
  Dropdown,
  Box,
  Text,
  Badge,
  Button,
  Card,
  Layout,
  Cell,
  Loader,
  Divider,
} from '@wix/design-system';
import { useCreateShipment } from '@/app/client-hooks/shipments';
import { useBuyLabel } from '@/app/client-hooks/labels';
import { useSDK } from '@/app/utils/wix-sdk.client-only';
import { extractOrderRecipient, normalizeStateCode } from '@/app/utils/address-helper';
import { packItemsForEasyPost } from '@/app/utils/box-packer';
import {
  matchRateWithCheckoutChoice,
  extractOrderShippingChoice,
  formatCarrierService,
  OrderShippingChoice,
} from '@/app/utils/rate-matcher';
import { QuotaExceededUpgradeModal } from '@/app/dashboard/parts/modals/QuotaExceededUpgradeModal';
import { EasyPostRate, EasyPostShipment } from '@/app/types/easypost.model';

export interface ShipmentModalOrder {
  _id?: string;
  id?: string;
  number?: string;
  weightUnit?: string;
  currency?: string;
  buyerInfo?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  buyerContactDetails?: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  };
  billingInfo?: {
    contactDetails?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      company?: string;
    };
    address?: {
      addressLine1?: string;
      addressLine2?: string;
      addressLine?: string;
      city?: string;
      subdivision?: string;
      postalCode?: string;
      country?: string;
    };
  };
  recipient?: {
    contactDetails?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      company?: string;
    };
    address?: {
      addressLine1?: string;
      addressLine2?: string;
      addressLine?: string;
      city?: string;
      subdivision?: string;
      postalCode?: string;
      country?: string;
    };
  };
  shippingInfo?: {
    carrierId?: string;
    code?: string;
    title?: string;
    cost?: {
      price?: string;
      currency?: string;
    };
    logistics?: {
      deliveryTime?: string;
      instructions?: string;
      shippingDestination?: {
        contactDetails?: {
          firstName?: string;
          lastName?: string;
          phone?: string;
          company?: string;
        };
        address?: {
          addressLine1?: string;
          addressLine2?: string;
          addressLine?: string;
          city?: string;
          subdivision?: string;
          postalCode?: string;
          country?: string;
        };
      };
    };
  };
  priceSummary?: {
    shipping?: {
      amount?: string;
      formattedAmount?: string;
    };
    total?: {
      amount?: string;
      formattedAmount?: string;
    };
  };
  shippingAddress?: {
    recipient?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    address?: {
      addressLine1?: string;
      addressLine?: string;
      city?: string;
      subdivision?: string;
      postalCode?: string;
      country?: string;
    };
  };
  lineItems?: Array<{
    _id?: string;
    id?: string;
    productName?: { original?: string; translated?: string };
    name?: string;
    quantity?: number;
    weight?: number;
    physicalProperties?: {
      weight?: number;
      sku?: string;
      dimensions?: {
        length?: number;
        width?: number;
        height?: number;
      };
    };
    price?: { amount?: string };
  }>;
}

export function ShipmentPreparationModal({
  isOpen,
  onClose,
  order,
}: {
  isOpen: boolean;
  onClose: () => void;
  order: ShipmentModalOrder | null;
}) {
  const {
    dashboard: { showToast },
  } = useSDK();
  const createShipment = useCreateShipment();
  const buyLabel = useBuyLabel();

  // Package settings
  const [packagePreset, setPackagePreset] = useState('box-medium');
  const [length, setLength] = useState('11');
  const [width, setWidth] = useState('8.5');
  const [height, setHeight] = useState('5.5');
  const [weight, setWeight] = useState('16.0'); // ounces

  // Destination address state
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('US');

  // Checkout shipping choice state
  const [shippingChoice, setShippingChoice] = useState<OrderShippingChoice | null>(null);

  // Live Carrier Rates State
  const [isFetchingRates, setIsFetchingRates] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentShipment, setCurrentShipment] = useState<EasyPostShipment | null>(null);
  const [rates, setRates] = useState<EasyPostRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [matchedRate, setMatchedRate] = useState<EasyPostRate | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null);

  // Purchasing & Success state
  const [isBuying, setIsBuying] = useState(false);
  const [purchasedLabel, setPurchasedLabel] = useState<any>(null);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);

  // Sync recipient, address, cartonization, and checkout choice from Wix Order schema
  useEffect(() => {
    if (!order || !isOpen) return;

    setPurchasedLabel(null);
    setCurrentShipment(null);
    setRates([]);
    setSelectedRateId(null);
    setMatchedRate(null);
    setMatchExplanation(null);
    setFetchError(null);

    // 1. Recipient and Destination
    const parsed = extractOrderRecipient(order);
    setRecipientName(parsed.name);
    setRecipientPhone(parsed.phone);
    setAddressLine(parsed.street1);
    setCity(parsed.city);
    setState(parsed.state);
    setZip(parsed.zip);
    setCountry(parsed.country || 'US');

    // 2. Checkout selection extraction
    const choice = extractOrderShippingChoice(order);
    setShippingChoice(choice);

    // 3. Cartonization from order line items
    const packed = packItemsForEasyPost(order.lineItems || [], {
      weightUnit: order.weightUnit,
    });

    setLength(String(packed.parcel.length));
    setWidth(String(packed.parcel.width));
    setHeight(String(packed.parcel.height));
    setWeight(String(packed.parcel.weight));

    if (packed.parcel.length === 6 && packed.parcel.width === 6 && packed.parcel.height === 4) {
      setPackagePreset('box-small');
    } else if (packed.parcel.length === 11 && packed.parcel.width === 8.5 && packed.parcel.height === 5.5) {
      setPackagePreset('box-medium');
    } else if (packed.parcel.length === 12 && packed.parcel.width === 12 && packed.parcel.height === 8) {
      setPackagePreset('box-large');
    } else if (packed.parcel.length === 12.5 && packed.parcel.width === 9.5 && packed.parcel.height === 0.75) {
      setPackagePreset('envelope-flat');
    } else {
      setPackagePreset('custom');
    }
  }, [order, isOpen]);

  // Query live carrier rates for destination & parcel
  const fetchLiveRates = useCallback(
    async (
      overrideDest?: { street1: string; city: string; state: string; zip: string; country: string },
      overrideParcel?: { length: string; width: string; height: string; weight: string },
      overrideRecipient?: { name?: string; phone?: string; email?: string },
    ) => {
      if (!order) return;

      const effectiveStreet = overrideDest ? overrideDest.street1 : addressLine;
      const effectiveCity = overrideDest ? overrideDest.city : city;
      const effectiveZip = overrideDest ? overrideDest.zip : zip;
      const effectiveState = overrideDest ? overrideDest.state : state;
      const effectiveCountry = overrideDest ? overrideDest.country : country;

      if (!effectiveStreet.trim() || !effectiveCity.trim() || !effectiveZip.trim()) {
        setFetchError('Destination street address, city, and postal code are required to calculate carrier rates.');
        return;
      }

      setIsFetchingRates(true);
      setFetchError(null);

      try {
        const destCountry = (effectiveCountry || 'US').trim().toUpperCase();
        const destState = normalizeStateCode(effectiveState, destCountry);
        const effectiveOrderId = order._id || order.id || '';
        const orderNumber = order.number || effectiveOrderId.slice(0, 8);

        const currentChoice = extractOrderShippingChoice(order);
        const lVal = parseFloat(overrideParcel ? overrideParcel.length : length) || 11;
        const wVal = parseFloat(overrideParcel ? overrideParcel.width : width) || 8.5;
        const hVal = parseFloat(overrideParcel ? overrideParcel.height : height) || 5.5;
        const wtVal = parseFloat(overrideParcel ? overrideParcel.weight : weight) || 16.0;

        // Resolve real recipient name and phone without empty-closure regression
        const currentRecipient = extractOrderRecipient(order);
        const effectiveName = (
          overrideRecipient?.name ||
          recipientName ||
          currentRecipient.name ||
          'Valued Customer'
        ).trim();

        const effectivePhone = (
          overrideRecipient?.phone ||
          recipientPhone ||
          currentRecipient.phone ||
          '5555555555'
        ).trim();

        const effectiveEmail = (
          overrideRecipient?.email ||
          order.buyerInfo?.email ||
          (order as any)?.buyerContactDetails?.email ||
          currentRecipient.email ||
          ''
        ).trim();

        const shipment = await createShipment({
          orderId: effectiveOrderId,
          orderNumber,
          recipient: {
            name: effectiveName,
            street1: effectiveStreet.trim(),
            city: effectiveCity.trim(),
            state: destState,
            zip: effectiveZip.trim(),
            country: destCountry,
            phone: effectivePhone,
            email: effectiveEmail,
          },
          parcel: {
            length: lVal,
            width: wVal,
            height: hVal,
            weight: wtVal,
          },
          items: (order.lineItems || []).map((item: any, idx: number) => ({
            id: item._id || item.id || `item-${idx}`,
            item_id: item._id || item.id || `line-${idx}`,
            title: item.productName?.original || item.productName?.translated || item.name || `Product ${idx + 1}`,
            quantity: item.quantity || 1,
            weight_oz: wtVal / Math.max(1, order.lineItems?.length || 1),
            price: item.price?.amount ? parseFloat(item.price.amount) : undefined,
          })),
          shippingChoice: currentChoice,
        });

        setCurrentShipment(shipment);
        const returnedRates = shipment.rates || [];
        setRates(returnedRates);

        if (returnedRates.length === 0) {
          throw new Error('No carrier rates returned by EasyPost for this destination.');
        }

        // Match rate with customer's checkout choice
        const match = matchRateWithCheckoutChoice(returnedRates, currentChoice);
        if (match) {
          setSelectedRateId(match.matchedRate.id);
          setMatchedRate(match.matchedRate);
          setMatchExplanation(match.explanation);
        } else {
          setSelectedRateId(returnedRates[0].id);
          setMatchedRate(returnedRates[0]);
          setMatchExplanation('Defaulted to lowest carrier rate');
        }
      } catch (err: any) {
        console.error('Fetch live rates error:', err);
        setFetchError(err?.message || 'Failed to fetch carrier rates');
      } finally {
        setIsFetchingRates(false);
      }
    },
    [
      order,
      addressLine,
      city,
      state,
      zip,
      country,
      recipientName,
      recipientPhone,
      length,
      width,
      height,
      weight,
      createShipment,
    ],
  );

  // Auto-fetch carrier rates when modal opens with valid destination
  useEffect(() => {
    if (!isOpen || !order) return;

    const parsed = extractOrderRecipient(order);
    if (parsed.street1 && parsed.city && parsed.zip) {
      const packed = packItemsForEasyPost(order.lineItems || [], {
        weightUnit: order.weightUnit,
      });

      void fetchLiveRates(
        {
          street1: parsed.street1,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          country: parsed.country || 'US',
        },
        {
          length: String(packed.parcel.length),
          width: String(packed.parcel.width),
          height: String(packed.parcel.height),
          weight: String(packed.parcel.weight),
        },
        {
          name: parsed.name,
          phone: parsed.phone,
          email: parsed.email,
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, order]);

  if (!order || !isOpen) return null;

  const handlePackagePresetSelect = (code: string) => {
    setPackagePreset(code);
    let newL = length;
    let newW = width;
    let newH = height;
    let newWt = weight;

    if (code === 'box-small') {
      newL = '6';
      newW = '6';
      newH = '4';
      newWt = '10';
    } else if (code === 'box-medium') {
      newL = '11';
      newW = '8.5';
      newH = '5.5';
      newWt = '16';
    } else if (code === 'box-large') {
      newL = '12';
      newW = '12';
      newH = '8';
      newWt = '32';
    } else if (code === 'envelope-flat') {
      newL = '12.5';
      newW = '9.5';
      newH = '0.75';
      newWt = '8';
    }

    setLength(newL);
    setWidth(newW);
    setHeight(newH);
    setWeight(newWt);

    // Invalidate current rates so merchant recalculates with new dimensions
    setRates([]);
    setSelectedRateId(null);
  };

  const handleBuySelectedLabel = async () => {
    if (!currentShipment || !selectedRateId) {
      showToast({
        message: 'Please fetch and select a carrier rate before purchasing label.',
        type: 'error',
      });
      return;
    }

    setIsBuying(true);
    try {
      const chosenRate = rates.find((r) => r.id === selectedRateId);
      const purchased = await buyLabel({
        shipmentId: currentShipment.id,
        rateId: selectedRateId,
      });

      setPurchasedLabel({
        ...purchased,
        carrier: chosenRate?.carrier || purchased.carrier,
        service: chosenRate?.service || purchased.service,
        rate_amount: chosenRate ? parseFloat(chosenRate.rate) : purchased.rate_amount,
      });

      showToast({
        message: `Postage label purchased! Tracking: ${purchased.tracking_code || 'Generated'}`,
        type: 'success',
      });

      if (purchased.label_url) {
        window.open(purchased.label_url, '_blank');
      }
    } catch (err: any) {
      console.error('Label purchase error:', err);
      const errMsg = err?.message || 'Unknown error';
      if (
        errMsg.includes('MONTHLY_LABEL_QUOTA_EXCEEDED') ||
        errMsg.toLowerCase().includes('quota') ||
        errMsg.toLowerCase().includes('limit reached')
      ) {
        setIsQuotaModalOpen(true);
      } else {
        showToast({
          message: `Failed to purchase label: ${errMsg}`,
          type: 'error',
        });
      }
    } finally {
      setIsBuying(false);
    }
  };

  const selectedRate = rates.find((r) => r.id === selectedRateId);
  const customerPaidDisplay = shippingChoice?.cost?.price
    ? `$${parseFloat(shippingChoice.cost.price).toFixed(2)}`
    : '$0.00';

  // 1. Success view
  if (purchasedLabel) {
    return (
      <Modal isOpen={isOpen} onRequestClose={onClose} shouldCloseOnOverlayClick={true}>
        <CustomModalLayout
          title='Postage Label Purchased Successfully!'
          primaryButtonText='Print / View Label'
          primaryButtonOnClick={() => {
            if (purchasedLabel.label_url) {
              window.open(purchasedLabel.label_url, '_blank');
            }
          }}
          secondaryButtonText='Done'
          secondaryButtonOnClick={onClose}
          onCloseButtonClick={onClose}
          width='600px'
        >
          <Box direction='vertical' gap='SP4' align='center'>
            <Badge skin='success' size='medium'>
              Postage Ready
            </Badge>
            <Text weight='bold' size='medium'>
              Order #{order.number || (order._id || order.id || '').slice(0, 8)} is fulfilled!
            </Text>
            <Card>
              <Card.Content>
                <Box direction='vertical' gap='SP2'>
                  <Box direction='horizontal' align='space-between'>
                    <Text secondary>Tracking Number:</Text>
                    <Text weight='bold'>{purchasedLabel.tracking_code || 'Generated'}</Text>
                  </Box>
                  <Box direction='horizontal' align='space-between'>
                    <Text secondary>Carrier & Service:</Text>
                    <Text weight='bold'>{formatCarrierService(purchasedLabel.carrier, purchasedLabel.service)}</Text>
                  </Box>
                  <Box direction='horizontal' align='space-between'>
                    <Text secondary>Postage Cost:</Text>
                    <Text weight='bold'>
                      ${(purchasedLabel.rate_amount || 0).toFixed(2)} {purchasedLabel.rate_currency || 'USD'}
                    </Text>
                  </Box>
                </Box>
              </Card.Content>
            </Card>
            <Text size='small' secondary>
              The label has been saved to your database and can be reprinted anytime from the Orders tab.
            </Text>
          </Box>
        </CustomModalLayout>
      </Modal>
    );
  }

  // 2. Fulfill & Rate Selection View
  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} shouldCloseOnOverlayClick={false}>
      <CustomModalLayout
        title={`Fulfill Order #${order.number || (order._id || order.id || '').slice(0, 8)} with EasyPost`}
        primaryButtonText={
          isBuying
            ? 'Purchasing Postage...'
            : isFetchingRates
              ? 'Calculating Rates...'
              : selectedRate
                ? `Buy Label: ${selectedRate.carrier} ${selectedRate.service} ($${parseFloat(selectedRate.rate).toFixed(2)})`
                : 'Calculate Live Rates'
        }
        primaryButtonOnClick={selectedRate ? handleBuySelectedLabel : () => fetchLiveRates()}
        primaryButtonProps={{ disabled: isBuying || isFetchingRates }}
        secondaryButtonText='Cancel'
        secondaryButtonOnClick={onClose}
        secondaryButtonProps={{ disabled: isBuying || isFetchingRates }}
        onCloseButtonClick={onClose}
        width='720px'
      >
        <Box direction='vertical' gap='SP4'>
          {/* Customer Checkout Selection Card */}
          <Card>
            <Card.Content>
              <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                <Box direction='vertical' gap='SP1'>
                  <Box direction='horizontal' gap='SP2' verticalAlign='middle'>
                    <Badge skin='premium' size='small'>
                      Customer Checkout Selection
                    </Badge>
                    <Text weight='bold'>{shippingChoice?.title || 'Standard Shipping'}</Text>
                  </Box>
                  <Text size='small' secondary>
                    {shippingChoice?.deliveryTime
                      ? `Delivery estimate: ${shippingChoice.deliveryTime}`
                      : 'Delivery service selected by customer at checkout'}
                  </Text>
                </Box>
                <Box direction='vertical' align='right'>
                  <Text size='tiny' secondary>
                    Customer Paid
                  </Text>
                  <Text weight='bold' size='medium'>
                    {customerPaidDisplay}
                  </Text>
                </Box>
              </Box>
            </Card.Content>
          </Card>

          {/* Section 1: Destination Address */}
          <Box direction='vertical' gap='SP1'>
            <Text weight='bold' size='medium'>
              Destination / Recipient Address
            </Text>
            <Text size='small' secondary>
              Extracted from Wix Order. You can review or edit before requesting carrier rates.
            </Text>
          </Box>

          <Layout>
            <Cell span={7}>
              <FormField label='Recipient Name'>
                <Input
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder='e.g. John Doe'
                />
              </FormField>
            </Cell>
            <Cell span={5}>
              <FormField label='Phone'>
                <Input
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder='e.g. 555-555-5555'
                />
              </FormField>
            </Cell>
            <Cell span={12}>
              <FormField label='Street Address'>
                <Input
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder='e.g. 123 Main St, Apt 4B'
                />
              </FormField>
            </Cell>
            <Cell span={4}>
              <FormField label='City'>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder='e.g. San Francisco' />
              </FormField>
            </Cell>
            <Cell span={3}>
              <FormField label='State / Province'>
                <Input value={state} onChange={(e) => setState(e.target.value)} placeholder='e.g. CA' />
              </FormField>
            </Cell>
            <Cell span={3}>
              <FormField label='Postal Code'>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder='e.g. 94105' />
              </FormField>
            </Cell>
            <Cell span={2}>
              <FormField label='Country'>
                <Input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} placeholder='US' />
              </FormField>
            </Cell>
          </Layout>

          <Divider />

          {/* Section 2: Parcel Dimensions & Preset */}
          <Box direction='horizontal' align='space-between' verticalAlign='middle'>
            <Box direction='vertical' gap='SP1'>
              <Text weight='bold' size='medium'>
                Package & Parcel Dimensions
              </Text>
              <Text size='small' secondary>
                Auto-calculated using cartonization for this order&apos;s line items.
              </Text>
            </Box>
            <Button
              size='small'
              priority='secondary'
              onClick={() => fetchLiveRates()}
              disabled={isFetchingRates || isBuying}
            >
              Recalculate Rates
            </Button>
          </Box>

          <Layout>
            <Cell span={12}>
              <FormField label='Package Preset'>
                <Dropdown
                  selectedId={packagePreset}
                  options={[
                    { id: 'box-small', value: 'Small Box (6 x 6 x 4 in)' },
                    { id: 'box-medium', value: 'Medium Box (11 x 8.5 x 5.5 in)' },
                    { id: 'box-large', value: 'Large Box (12 x 12 x 8 in)' },
                    { id: 'envelope-flat', value: 'Flat Rate Envelope (12.5 x 9.5 x 0.75 in)' },
                    { id: 'custom', value: 'Custom Dimensions' },
                  ]}
                  onSelect={(option) => handlePackagePresetSelect(option.id as string)}
                />
              </FormField>
            </Cell>

            <Cell span={3}>
              <FormField label='Length (in)'>
                <Input
                  value={length}
                  onChange={(e) => {
                    setLength(e.target.value);
                    setRates([]);
                  }}
                  type='number'
                />
              </FormField>
            </Cell>
            <Cell span={3}>
              <FormField label='Width (in)'>
                <Input
                  value={width}
                  onChange={(e) => {
                    setWidth(e.target.value);
                    setRates([]);
                  }}
                  type='number'
                />
              </FormField>
            </Cell>
            <Cell span={3}>
              <FormField label='Height (in)'>
                <Input
                  value={height}
                  onChange={(e) => {
                    setHeight(e.target.value);
                    setRates([]);
                  }}
                  type='number'
                />
              </FormField>
            </Cell>
            <Cell span={3}>
              <FormField label='Weight (oz)'>
                <Input
                  value={weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                    setRates([]);
                  }}
                  type='number'
                />
              </FormField>
            </Cell>
          </Layout>

          <Divider />

          {/* Section 3: Live Carrier Rates Selection */}
          <Box direction='vertical' gap='SP2'>
            <Box direction='horizontal' align='space-between' verticalAlign='middle'>
              <Text weight='bold' size='medium'>
                Live Carrier Rates & Label Selection
              </Text>
              {matchExplanation && (
                <Text size='tiny' secondary>
                  {matchExplanation}
                </Text>
              )}
            </Box>

            {isFetchingRates && (
              <Box height='100px' align='center' verticalAlign='middle' direction='vertical' gap='SP2'>
                <Loader size='small' />
                <Text size='small' secondary>
                  Fetching real-time carrier rates from EasyPost...
                </Text>
              </Box>
            )}

            {fetchError && !isFetchingRates && (
              <Card>
                <Card.Content>
                  <Box direction='vertical' gap='SP2' align='center'>
                    <Text skin='error' size='small'>
                      {fetchError}
                    </Text>
                    <Button size='small' priority='secondary' onClick={() => fetchLiveRates()}>
                      Retry Calculating Rates
                    </Button>
                  </Box>
                </Card.Content>
              </Card>
            )}

            {!isFetchingRates && !fetchError && rates.length === 0 && (
              <Box height='80px' align='center' verticalAlign='middle' direction='vertical' gap='SP2'>
                <Text size='small' secondary>
                  Click calculate to retrieve carrier rates for this parcel.
                </Text>
                <Button size='small' priority='secondary' onClick={() => fetchLiveRates()}>
                  Calculate Rates
                </Button>
              </Box>
            )}

            {!isFetchingRates && rates.length > 0 && (
              <Box direction='vertical' gap='SP2'>
                {rates.map((rate) => {
                  const isSelected = rate.id === selectedRateId;
                  const isMatched = matchedRate?.id === rate.id;
                  const rateCost = parseFloat(rate.rate).toFixed(2);

                  return (
                    <div
                      key={rate.id}
                      onClick={() => setSelectedRateId(rate.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedRateId(rate.id);
                        }
                      }}
                      role='button'
                      tabIndex={0}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      <Box
                        direction='horizontal'
                        align='space-between'
                        verticalAlign='middle'
                        padding='SP2 SP3'
                        border={isSelected ? '2px solid #0055ff' : '1px solid #dfe5eb'}
                        backgroundColor={isSelected ? '#f0f6ff' : '#ffffff'}
                        borderRadius='8px'
                      >
                        <Box direction='vertical' gap='SP1'>
                          <Box direction='horizontal' gap='SP2' verticalAlign='middle'>
                            <Text weight={isSelected ? 'bold' : 'normal'}>
                              {formatCarrierService(rate.carrier, rate.service)}
                            </Text>
                            {isMatched && (
                              <Badge skin='success' size='small'>
                                ✓ Selected at Checkout
                              </Badge>
                            )}
                          </Box>
                          <Text size='tiny' secondary>
                            {rate.delivery_days
                              ? `Estimated ${rate.delivery_days} business day${rate.delivery_days > 1 ? 's' : ''}`
                              : 'Standard delivery'}
                          </Text>
                        </Box>

                        <Box direction='vertical' align='right'>
                          <Text weight='bold' size='medium'>
                            ${rateCost} {rate.currency || 'USD'}
                          </Text>
                          {isMatched && shippingChoice?.cost?.price && (
                            <Text size='tiny' secondary>
                              Customer paid ${parseFloat(shippingChoice.cost.price).toFixed(2)}
                            </Text>
                          )}
                        </Box>
                      </Box>
                    </div>
                  );
                })}
              </Box>
            )}
          </Box>
        </Box>
      </CustomModalLayout>

      <QuotaExceededUpgradeModal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        onUpgradeSuccess={() => {
          showToast({
            message: 'Plan upgraded successfully! You can now proceed to purchase postage.',
            type: 'success',
          });
        }}
      />
    </Modal>
  );
}
