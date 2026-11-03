import { NextRequest } from 'next/server';
import { wixAppClient } from '@/app/utils/wix-sdk.app';
import { orders } from '@wix/ecom';
import { shipmentRepo } from '@/app/repositories';
import { EasyPostShipment } from '@/app/types/easypost.model';
import { withRequestLogging } from '@/app/utils/request-logger';

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

export const POST = withRequestLogging(
  async function POST(request: NextRequest) {
    try {
      console.info('Webhook::orders - received request');
      const { eventType, instanceId, payload } = await wixAppClient.webhooks.processRequest(request, {
        expectedEvents: [orders.onOrderApproved, orders.onOrderCanceled],
      });

      console.info('Webhook::orders - event processed:', { eventType, instanceId });

      const entity: WixWebhookOrderEntity =
        (payload as { entity?: WixWebhookOrderEntity })?.entity ||
        (payload as { order?: WixWebhookOrderEntity })?.order ||
        (payload as WixWebhookOrderEntity);

      const orderId = entity._id || entity.id;
      if (!orderId || !instanceId) {
        console.warn('Webhook::orders - missing orderId or instanceId in payload');
        return new Response('OK', { status: 200 });
      }

      const eventTypeStr = eventType as string;
      if (eventTypeStr === 'wix.ecom.v1.order_approved' || eventTypeStr === 'orderApproved') {
        await handleOrderApproved(instanceId, entity);
      } else if (eventTypeStr === 'wix.ecom.v1.order_canceled' || eventTypeStr === 'orderCanceled') {
        await handleOrderCanceled(instanceId, orderId);
      }

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Webhook::orders - error processing webhook:', error);
      return new Response('Error processing event', { status: 200 });
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
