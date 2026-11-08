import { type NextRequest } from 'next/server';
import { withRequestLogging } from '@/app/utils/request-logger';
import { verifyAndParseWixWebhook, isAppInstalledEvent, isAppRemovedEvent } from '@/app/utils/wix-webhook-verifier';
import { merchantSettingsRepo } from '@/app/repositories';
import { subscriptionRepo } from '@/app/repositories/subscription-repo';
import { handleWixBillingWebhookEvent } from '@/app/actions/billing-webhook.action';
import { logger } from '@/app/utils/logger';

/**
 * Health / Reachability check for Wix Dev Center and monitoring pings on root webhook endpoint.
 */
export const GET = async function GET() {
  return new Response(
    JSON.stringify({
      status: 'active',
      endpoints: ['install', 'uninstall', 'billing', 'orders'],
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

/**
 * Unified webhook dispatcher for Wix Developers Center.
 * Automatically inspects eventType and routes AppInstalled, AppRemoved, Billing, and Order events.
 */
export const POST = withRequestLogging(
  async function POST(request: NextRequest) {
    try {
      logger.info('WEBHOOK_DISPATCHER', 'Received webhook request on unified endpoint');

      const parsed = await verifyAndParseWixWebhook(request);

      logger.info('WEBHOOK_DISPATCHER', 'Parsed webhook event details', {
        eventType: parsed.eventType,
        instanceId: parsed.instanceId,
        isVerified: parsed.isVerified,
        verificationMethod: parsed.verificationMethod,
      });

      const { instanceId, eventType, payload } = parsed;

      if (!instanceId) {
        logger.warn('WEBHOOK_DISPATCHER', 'Webhook received without instanceId', { parsed });
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

      // 1. App Installed
      if (isAppInstalledEvent(eventType)) {
        try {
          await subscriptionRepo.getOrCreateSubscription(instanceId);
          const existingSettings = await merchantSettingsRepo.getSettings(instanceId);
          if (!existingSettings) {
            await merchantSettingsRepo.saveSettings(instanceId, {
              environment: 'TEST',
              defaultLabelFormat: 'PDF',
              enabledCarriers: ['USPS', 'FedEx', 'UPS', 'DHL'],
              fallbackRate: 10.0,
              defaultItemWeightOz: 16.0,
            });
          }
          logger.info('WEBHOOK_DISPATCHER', 'Tenant provisioned on App Installed event', { instanceId });
        } catch (dbErr: any) {
          logger.error('WEBHOOK_DISPATCHER', 'Database provisioning warning', dbErr);
        }

        return new Response(JSON.stringify({ received: true, status: 'installed', instanceId, eventType }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 2. App Removed / Uninstalled
      if (isAppRemovedEvent(eventType)) {
        try {
          await subscriptionRepo.cancelSubscription(instanceId);
          logger.info('WEBHOOK_DISPATCHER', 'Tenant subscription cancelled on App Removed', { instanceId });
        } catch (dbErr: any) {
          logger.warn('WEBHOOK_DISPATCHER', 'Error cancelling subscription', dbErr);
        }

        return new Response(JSON.stringify({ received: true, status: 'uninstalled', instanceId, eventType }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 3. Billing (Plan Purchased, Changed, Cancelled)
      const normalizedEvent = (eventType || '').toLowerCase();
      if (
        normalizedEvent.includes('plan') ||
        normalizedEvent.includes('billing') ||
        normalizedEvent.includes('subscription')
      ) {
        await handleWixBillingWebhookEvent({
          eventType,
          instanceId,
          data: payload,
        });

        return new Response(JSON.stringify({ received: true, status: 'billing_processed', instanceId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Default acknowledge for unknown or custom test events
      return new Response(JSON.stringify({ received: true, status: 'acknowledged', instanceId, eventType }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      logger.error('WEBHOOK_DISPATCHER', 'Fatal error handling webhook', error);
      return new Response(
        JSON.stringify({
          received: true,
          error: error?.message || 'Error processing webhook event',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
  { moduleName: 'api/webhooks' },
);
