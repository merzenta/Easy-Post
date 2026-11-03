import { NextRequest } from 'next/server';
import { shipmentRepo } from '@/app/repositories';
import { EasyPostShipment } from '@/app/types/easypost.model';
import { withRequestLogging } from '@/app/utils/request-logger';
import { verifyAndParseWixWebhook } from '@/app/utils/wix-webhook-verifier';
import { logger } from '@/app/utils/logger';

interface WixWebhookOrderEntity {
  _id?: string;
  id?: string;
  number?: string;
  buyerInfo?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  shippingInfo?: {
    code?: string;
    title?: string;
    logistics?: {
      deliveryTime?: string;
      shippingDestination?: {
        address?: {
          addressLine1?: string;
          addressLine2?: string;
          city?: string;
          subdivision?: string;
          postalCode?: string;
          country?: string;
        };
      };
    };
  };
  recipient?: {
    address?: {
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      subdivision?: string;
      postalCode?: string;
      country?: string;
    };
    contactDetails?: {
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
  };
  lineItems?: Array<{
    _id?: string;
    id?: string;
    productName?: { original?: string; translated?: string };
    quantity?: number;
    price?: { amount?: string };
    physicalProperties?: {
      weight?: number;
      dimensions?: {
        length?: number;
        width?: number;
        height?: number;
      };
    };
  }>;
}

/**
 * Health / Reachability check for Wix Dev Center and monitoring pings.
 */
export const GET = async function GET() {
  return new Response(
    JSON.stringify({
      status: 'active',
      webhook: 'wix.ecom.v1.orders',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

export const POST = withRequestLogging(
  async function POST(request: NextRequest) {
    try {
      logger.info('WEBHOOK_ORDERS', 'Received orders webhook request');
      const parsed = await verifyAndParseWixWebhook(request);

      logger.info('WEBHOOK_ORDERS', 'Event processed', {
        eventType: parsed.eventType,
        instanceId: parsed.instanceId,
        isVerified: parsed.isVerified,
        verificationMethod: parsed.verificationMethod,
      });

      const { eventType, instanceId, payload } = parsed;

      const entity: WixWebhookOrderEntity =
        (payload as { entity?: WixWebhookOrderEntity })?.entity ||
        (payload as { order?: WixWebhookOrderEntity })?.order ||
        (payload as WixWebhookOrderEntity);

      const orderId = entity?._id || entity?.id;
      if (!orderId || !instanceId) {
        logger.warn('WEBHOOK_ORDERS', 'Missing orderId or instanceId in payload', { parsed });
        return new Response(JSON.stringify({ received: true, warning: 'missing orderId or instanceId' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const eventTypeStr = (eventType as string).toLowerCase();
      if (
        eventTypeStr === 'wix.ecom.v1.order_approved' ||
        eventTypeStr === 'orderapproved' ||
        eventTypeStr.includes('approved')
      ) {
        await handleOrderApproved(instanceId, entity);
      } else if (
        eventTypeStr === 'wix.ecom.v1.order_canceled' ||
        eventTypeStr === 'ordercanceled' ||
        eventTypeStr.includes('canceled') ||
        eventTypeStr.includes('cancelled')
      ) {
        await handleOrderCanceled(instanceId, orderId);
      }

      return new Response(JSON.stringify({ received: true, status: 'processed', orderId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      logger.error('WEBHOOK_ORDERS', 'Fatal error handling orders webhook', error);
      return new Response(JSON.stringify({ received: true, error: error?.message || 'Error processing event' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  { moduleName: 'api/webhooks/v1/orders' },
);

/**
 * Stages an approved Wix order as a CREATED shipment for merchant review in the dashboard.
 */
async function handleOrderApproved(instanceId: string, order: WixWebhookOrderEntity) {
  const orderId = order._id || order.id || '';
  const orderNumber = order.number || orderId;

  const rawAddress = order.recipient?.address || order.shippingInfo?.logistics?.shippingDestination?.address;
  const recipientName =
    order.recipient?.contactDetails?.firstName && order.recipient?.contactDetails?.lastName
      ? `${order.recipient.contactDetails.firstName} ${order.recipient.contactDetails.lastName}`
      : order.buyerInfo?.firstName && order.buyerInfo?.lastName
        ? `${order.buyerInfo.firstName} ${order.buyerInfo.lastName}`
        : 'Store Customer';

  const street1 = (rawAddress as any)?.addressLine || rawAddress?.addressLine1 || '100 Main St';

  const normalizedState = (rawAddress?.subdivision || '').replace(/^[A-Z]{2}-/, '') || 'CA';

  const recipientAddress = {
    name: recipientName,
    street1,
    street2: rawAddress?.addressLine2,
    city: rawAddress?.city || 'San Francisco',
    state: normalizedState,
    zip: rawAddress?.postalCode || '94105',
    country: rawAddress?.country || 'US',
    phone: order.recipient?.contactDetails?.phone || order.buyerInfo?.phone,
    email: order.buyerInfo?.email,
  };

  const draftShipment: EasyPostShipment = {
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    instance_id: instanceId,
    wix_order_id: orderId,
    easypost_shipment_id: `draft-order-${orderNumber}`,
    status: 'CREATED',
    carrier: 'USPS',
    service: 'Priority',
    rate_amount: 0.0,
    rate_currency: 'USD',
    label_format: 'PDF',
    sender_address: {
      name: 'Warehouse Dispatch',
      street1: '388 Beale St',
      city: 'San Francisco',
      state: 'CA',
      zip: '94105',
      country: 'US',
    },
    recipient_address: recipientAddress,
    parcel: {
      length: 11,
      width: 8.5,
      height: 5.5,
      weight: 16.0,
    },
    items: (order.lineItems || []).map((li, idx) => ({
      id: `item-${idx}`,
      item_id: li._id || li.id || `line-${idx}`,
      title: li.productName?.original || `Product ${idx + 1}`,
      quantity: li.quantity || 1,
      weight_oz: 16.0,
      price: li.price?.amount ? parseFloat(li.price.amount) : undefined,
    })),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    await shipmentRepo.saveShipment(draftShipment);
    console.info('Webhook::orders - successfully staged EasyPost shipment for order:', orderId);
  } catch (err) {
    console.error('Webhook::orders - failed to save staged shipment:', err);
  }
}

/**
 * Handles order cancellation by removing or updating staged shipments.
 */
async function handleOrderCanceled(instanceId: string, orderId: string) {
  try {
    const existing = await shipmentRepo.getShipmentsByOrderId(instanceId, orderId);
    for (const ship of existing) {
      if (ship.status === 'CREATED') {
        await shipmentRepo.updateShipmentStatus(instanceId, ship.id, 'CANCELLED');
      }
    }
    console.info('Webhook::orders - processed cancellation for order:', orderId);
  } catch (err) {
    console.error('Webhook::orders - failed to update canceled order shipments:', err);
  }
}
