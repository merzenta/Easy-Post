import { type NextRequest } from 'next/server';
import { withRequestLogging } from '@/app/utils/request-logger';
import { verifyAndParseWixWebhook } from '@/app/utils/wix-webhook-verifier';
import { webhookWorker } from '@/app/utils/webhook-worker';
import { logger } from '@/app/utils/logger';

/**
 * Health / Reachability check for Wix Dev Center and monitoring pings.
 */
export const GET = async function GET() {
  return new Response(
    JSON.stringify({
      status: 'active',
      webhook: 'wix.app_instances.v1.app_instance_installed',
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
      logger.info('WEBHOOK_INSTALL', 'Received App Installed webhook request');

      const parsed = await verifyAndParseWixWebhook(request);

      logger.info('WEBHOOK_INSTALL', 'Parsed webhook event details', {
        eventType: parsed.eventType,
        instanceId: parsed.instanceId,
        isVerified: parsed.isVerified,
        verificationMethod: parsed.verificationMethod,
      });

      const { instanceId, eventType } = parsed;

      if (!instanceId) {
        logger.warn('WEBHOOK_INSTALL', 'Received webhook without instanceId', { parsed });
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

      // Delegate database provisioning to background worker queue
      const job = webhookWorker.enqueue({
        type: 'APP_INSTALLED',
        instanceId,
        eventType: eventType || 'AppInstalled',
        payload: parsed.payload,
      });

      // In unit test runner, await queue drain so database assertions pass synchronously
      if (process.env.NODE_ENV === 'test') {
        await webhookWorker.drain();
      }

      return new Response(
        JSON.stringify({
          received: true,
          status: 'installed',
          instanceId,
          jobId: job.id,
          eventType: eventType || 'AppInstalled',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (error: any) {
      logger.error('WEBHOOK_INSTALL', 'Fatal error handling install webhook', error);
      // Return 200 to acknowledge webhook receipt so Wix doesn't mark it as failed
      return new Response(
        JSON.stringify({
          received: true,
          error: error?.message || 'Error processing install event',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
  { moduleName: 'api/webhooks/v1/install' },
);
