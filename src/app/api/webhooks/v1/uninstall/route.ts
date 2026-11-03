import { type NextRequest } from 'next/server';
import { withRequestLogging } from '@/app/utils/request-logger';
import { verifyAndParseWixWebhook } from '@/app/utils/wix-webhook-verifier';
import { subscriptionRepo } from '@/app/repositories/subscription-repo';
import { logger } from '@/app/utils/logger';

/**
 * Health / Reachability check for Wix Dev Center and monitoring pings.
 */
export const GET = async function GET() {
  return new Response(
    JSON.stringify({
      status: 'active',
      webhook: 'wix.app_instances.v1.app_instance_removed',
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
      logger.info('WEBHOOK_UNINSTALL', 'Received App Removed webhook request');

      const parsed = await verifyAndParseWixWebhook(request);

      logger.info('WEBHOOK_UNINSTALL', 'Parsed webhook event details', {
        eventType: parsed.eventType,
        instanceId: parsed.instanceId,
        isVerified: parsed.isVerified,
        verificationMethod: parsed.verificationMethod,
      });

      const { instanceId, eventType } = parsed;

      if (!instanceId) {
        logger.warn('WEBHOOK_UNINSTALL', 'Received webhook without instanceId', { parsed });
        return new Response(
          JSON.stringify({
            received: true,
            warning: 'Missing instanceId in payload',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      }

      // Mark tenant subscription as CANCELLED in database
      try {
        await subscriptionRepo.cancelSubscription(instanceId);
        logger.info('WEBHOOK_UNINSTALL', 'Tenant subscription cancelled', { instanceId });
      } catch (dbErr: any) {
        logger.warn('WEBHOOK_UNINSTALL', 'Error cancelling subscription (tenant may not exist)', {
          error: dbErr?.message,
        });
      }

      return new Response(
        JSON.stringify({
          received: true,
          status: 'uninstalled',
          instanceId,
          eventType: eventType || 'AppRemoved',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      logger.error('WEBHOOK_UNINSTALL', 'Fatal error handling uninstall webhook', error);
      return new Response(
        JSON.stringify({
          received: true,
          error: error?.message || 'Error processing uninstall event',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
  { moduleName: 'api/webhooks/v1/uninstall' },
);
