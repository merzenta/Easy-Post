import { NextRequest } from 'next/server';
import { handleWixBillingWebhookEvent } from '@/app/actions/billing-webhook.action';
import { withRequestLogging } from '@/app/utils/request-logger';
import { verifyAndParseWixWebhook } from '@/app/utils/wix-webhook-verifier';
import { logger } from '@/app/utils/logger';

/**
 * Health / Reachability check for Wix Dev Center and monitoring pings.
 */
export const GET = async function GET() {
  return new Response(
    JSON.stringify({
      status: 'active',
      webhook: 'wix.app_market.billing',
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
      logger.info('WEBHOOK_BILLING', 'Received billing webhook request');

      const parsed = await verifyAndParseWixWebhook(request);

      logger.info('WEBHOOK_BILLING', 'Parsed webhook details', {
        eventType: parsed.eventType,
        instanceId: parsed.instanceId,
        isVerified: parsed.isVerified,
        verificationMethod: parsed.verificationMethod,
      });

      const { instanceId, eventType, payload } = parsed;

      if (instanceId && eventType) {
        await handleWixBillingWebhookEvent({
          eventType,
          instanceId,
          data: payload,
        });
      } else {
        logger.warn('WEBHOOK_BILLING', 'Missing instanceId or eventType in payload', { parsed });
      }

      return new Response(JSON.stringify({ received: true, status: 'processed', instanceId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      logger.error('WEBHOOK_BILLING', 'Fatal error handling billing webhook', error);
      return new Response(
        JSON.stringify({
          received: true,
          error: error?.message || 'Error processing billing event',
        }),
        {
          status: 200, // Return 200 to acknowledge webhook receipt so Wix doesn't loop retries on bad payload
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
  { moduleName: 'api/webhooks/v1/billing' },
);
