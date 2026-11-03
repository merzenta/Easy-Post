import { wixAppClient } from '@/app/utils/wix-sdk.app';
import { merchantSettingsRepo } from '@/app/repositories';
import { createEasyPostClient } from '@/app/utils/easypost-client';
import { packItemsForEasyPost } from '@/app/utils/box-packer';
import { generateRateCacheKey, getCachedRates, setCachedRates } from '@/app/utils/rate-cache';
import { createTenantLogger } from '@/app/utils/logger';
import { withRequestLogging } from '@/app/utils/request-logger';
import { EasyPostAddress, EasyPostCustomsInfo } from '@/app/types/easypost.model';
import { normalizeStateCode } from '@/app/utils/address-helper';

interface ShippingOption {
  code: string;
  title: string;
  logistics: {
    deliveryTime: string;
  };
  cost: {
    price: string;
    currency: string;
  };
}

wixAppClient.shippingRates.provideHandlers({
  async getShippingRates({ request, metadata }) {
    const startTime = Date.now();
    const instanceId = metadata.instanceId || 'unknown-instance';
    const correlationId = `spi-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const tenantLogger = createTenantLogger(instanceId, correlationId, undefined, 'api/shipping-rates/v1/getRates');

    const currency = metadata.currency || 'USD';
    const destination = request.shippingDestination;
    const destCountry = (destination?.country || 'US').toUpperCase();
    const destPostalCode = destination?.postalCode || '';
    const destCity = destination?.city || '';
    const destState = normalizeStateCode(destination?.subdivision, destCountry);
    const destStreet1 =
      (destination as any)?.addressLine ||
      destination?.addressLine1 ||
      (destination as any)?.address?.addressLine ||
      (destination as any)?.address?.addressLine1 ||
      '';
    const destStreet2 = (destination as any)?.addressLine2 || (destination as any)?.address?.addressLine2 || '';

    const destLog = {
      country: destCountry,
      subdivision: destState,
      city: destCity,
      postalCode: destPostalCode,
      street: [destStreet1, destStreet2].filter(Boolean).join(', ') || undefined,
    };

    // 1. Load tenant configuration
    const settings = metadata.instanceId ? await merchantSettingsRepo.getSettings(metadata.instanceId) : null;
    const fallbackRate = settings?.fallbackRate ?? 10.0;

    const originLocation = settings?.merchantLocation || (request as any)?.shippingOrigin || {};
    const originCountry = (originLocation.country || 'US').toUpperCase();
    const originCity = originLocation.city || '';
    const originState = normalizeStateCode(originLocation.state || originLocation.subdivision, originCountry);
    const originZip = originLocation.zip || originLocation.postalCode || '';
    const originStreet = [
      originLocation.street1 || originLocation.addressLine1 || originLocation.addressLine || '',
      originLocation.street2 || originLocation.addressLine2 || '',
    ]
      .filter(Boolean)
      .join(', ');

    const originLog = {
      country: originCountry,
      subdivision: originState,
      city: originCity,
      postalCode: originZip,
      street: originStreet || undefined,
    };

    tenantLogger.debug('CHECKOUT_RATES_REQUESTED', 'Received Wix Checkout getShippingRates SPI query', {
      origin: originLog,
      destination: destLog,
      lineItemsCount: request.lineItems?.length || 0,
      currency,
    });

    // Helper for emergency fallback
    const createFallbackResponse = (rate = fallbackRate, reason = 'Default fallback') => {
      const durationMs = Date.now() - startTime;
      tenantLogger.rateAudit(
        'CHECKOUT_RATES_FALLBACK',
        {
          reason,
          fallbackRate: rate,
          origin: originLog,
          destination: destLog,
          durationMs,
        },
        durationMs,
      );

      return {
        shippingRates: [
          {
            code: 'easypost-fallback-standard',
            title: 'Standard Shipping',
            logistics: {
              deliveryTime: '3–5 business days',
            },
            cost: {
              price: rate.toFixed(2),
              currency,
            },
          },
        ],
      };
    };

    if (!settings || !metadata.instanceId) {
      return createFallbackResponse(fallbackRate, 'Merchant settings or instanceId missing');
    }

    try {
      // 2. Cartonization (Pack line items into parcel)
      const packing = packItemsForEasyPost(request.lineItems || [], {
        destinationCountry: destCountry,
        weightUnit: request.weightUnit?.toString(),
        defaultWeightOz: settings.defaultItemWeightOz,
        packagePresets: settings.packagePresets,
      });

      // 3. Check Cache (5-Minute TTL)
      const cacheKey = generateRateCacheKey(
        instanceId,
        {
          country: destCountry,
          zip: destPostalCode,
          state: destState,
          city: destCity,
        },
        packing.parcel,
      );

      const cached = getCachedRates<ShippingOption[]>(cacheKey);
      if (cached) {
        const durationMs = Date.now() - startTime;
        tenantLogger.rateAudit(
          'CHECKOUT_RATES_CACHE_HIT',
          {
            origin: originLog,
            destination: destLog,
            ratesCount: cached.length,
            durationMs,
          },
          durationMs,
        );

        return { shippingRates: cached };
      }

      // Check if credentials are ready
      const hasCredentials = await merchantSettingsRepo.hasConfiguredCredentials(instanceId);
      if (!hasCredentials) {
        return createFallbackResponse(settings.fallbackRate, 'Credentials not yet configured');
      }

      const client = createEasyPostClient(settings.apiKey);
      const rates: ShippingOption[] = [];

      // 4. Query Carrier Rates via EasyPost
      const fromAddr: EasyPostAddress = {
        name: settings.merchantLocation.name || 'Shipping Dept',
        company: settings.merchantLocation.company || 'Store Warehouse',
        street1: settings.merchantLocation.street1 || '100 Main St',
        street2: settings.merchantLocation.street2 || undefined,
        city: settings.merchantLocation.city || 'San Francisco',
        state: normalizeStateCode(settings.merchantLocation.state || 'CA', settings.merchantLocation.country || 'US'),
        zip: settings.merchantLocation.zip || '94105',
        country: settings.merchantLocation.country || 'US',
        phone: settings.merchantLocation.phone || '4155551234',
        email: settings.merchantLocation.email || undefined,
      };

      const buyerContact = (request as any)?.buyerContactDetails;
      const recipientName = buyerContact?.firstName
        ? `${buyerContact.firstName} ${buyerContact.lastName || ''}`.trim()
        : buyerContact?.email || 'Valued Customer';

      const toStreet1 =
        (destination as any)?.addressLine ||
        destination?.addressLine1 ||
        (destination as any)?.address?.addressLine ||
        (destination as any)?.address?.addressLine1 ||
        '100 Delivery Rd';

      const toStreet2 = (destination as any)?.addressLine2 || (destination as any)?.address?.addressLine2 || undefined;

      const toAddr: EasyPostAddress = {
        name: recipientName,
        street1: toStreet1,
        street2: toStreet2,
        city: destCity || 'Anytown',
        state: destState || 'CA',
        zip: destPostalCode || '90210',
        country: destCountry,
        phone: buyerContact?.phone || '5555555555',
        email: buyerContact?.email || undefined,
      };

      let customsInfo: EasyPostCustomsInfo | undefined;
      const isInternational = destCountry !== (fromAddr.country || 'US').toUpperCase();

      if (isInternational) {
        customsInfo = {
          customs_cert: true,
          customs_signer: fromAddr.name || 'Shipper',
          contents_type: 'merchandise',
          non_delivery_option: 'return',
          customs_items: (request.lineItems || []).map((it) => {
            const priceVal = it.price ? parseFloat(String(it.price)) : 10.0;
            return {
              description: it.name || 'Merchandise',
              quantity: it.quantity || 1,
              weight: packing.parcel.weight,
              value: isNaN(priceVal) ? 10.0 : priceVal,
              origin_country: fromAddr.country || 'US',
            };
          }),
        };
      }

      const result = await client.getRates({
        fromAddress: fromAddr,
        toAddress: toAddr,
        parcel: packing.parcel,
        customsInfo,
        carrierAccounts: settings.carrierAccounts.length > 0 ? settings.carrierAccounts : undefined,
      });

      // Filter and format rates
      const allowedCarriers = (settings.enabledCarriers || []).map((c) => c.toUpperCase());

      for (const epRate of result.rates) {
        const rateCarrier = (epRate.carrier || '').toUpperCase();
        const carrierAllowed =
          allowedCarriers.length === 0 ||
          allowedCarriers.some((allowed) => rateCarrier === allowed || rateCarrier.startsWith(allowed));

        if (!carrierAllowed) {
          continue;
        }

        let cost = parseFloat(epRate.rate);
        if (isNaN(cost)) continue;

        // Apply handling fee
        if (settings.handlingFeeType === 'FLAT') {
          cost += settings.handlingFeeValue;
        } else if (settings.handlingFeeType === 'PERCENTAGE') {
          cost *= 1 + settings.handlingFeeValue / 100;
        }

        // Apply free shipping threshold if set
        if (settings.freeShippingThreshold !== undefined && settings.freeShippingThreshold > 0) {
          const cartTotal = (request.lineItems || []).reduce(
            (sum, item) => sum + (Number(item.price) || 0) * (item.quantity || 1),
            0,
          );
          if (cartTotal >= settings.freeShippingThreshold) {
            cost = 0.0;
          }
        }

        const deliveryWindow = epRate.delivery_days
          ? `${epRate.delivery_days} business day${epRate.delivery_days > 1 ? 's' : ''}`
          : '2–5 business days';

        rates.push({
          code: `easypost-${epRate.id}`,
          title: `${epRate.carrier} — ${epRate.service}`,
          logistics: {
            deliveryTime: deliveryWindow,
          },
          cost: {
            price: cost.toFixed(2),
            currency: epRate.currency || currency,
          },
        });
      }

      const durationMs = Date.now() - startTime;

      if (rates.length > 0) {
        setCachedRates(cacheKey, rates);

        tenantLogger.rateAudit(
          'CHECKOUT_RATES_CALCULATED',
          {
            origin: originLog,
            destination: destLog,
            weightOz: packing.parcel.weight,
            ratesCount: rates.length,
            services: rates.map((r) => ({ code: r.code, price: r.cost.price })),
            durationMs,
          },
          durationMs,
        );

        return { shippingRates: rates };
      }

      return createFallbackResponse(settings.fallbackRate, 'No services returned by carrier');
    } catch (error) {
      const durationMs = Date.now() - startTime;
      tenantLogger.error(
        'CHECKOUT_RATES_ERROR',
        'Error occurred during carrier rating; falling back to guarantee checkout continuity',
        error,
        { origin: originLog, destination: destLog, durationMs },
        durationMs,
      );
      return createFallbackResponse(fallbackRate, 'Exception during rating calculation');
    }
  },
});

export const POST = withRequestLogging(
  async function POST(request: Request) {
    return wixAppClient.servicePlugins.processRequest(request);
  },
  { moduleName: 'api/shipping-rates/v1/getRates' },
);
