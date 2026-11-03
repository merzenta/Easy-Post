import { type NextRequest } from 'next/server';
import { withRequestLogging } from '@/app/utils/request-logger';
import { verifyAndParseWixWebhook } from '@/app/utils/wix-webhook-verifier';
import { merchantSettingsRepo } from '@/app/repositories';
import { subscriptionRepo } from '@/app/repositories/subscription-repo';
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

      // Provision tenant in database on installation
      try {
        // 1. Initialize Default Merchant Subscription (Free Tier: 5 labels/mo)
        const sub = await subscriptionRepo.getOrCreateSubscription(instanceId);
        logger.info('WEBHOOK_INSTALL', 'Merchant subscription initialized', {
          instanceId,
          planType: sub.planType,
          monthlyQuota: sub.monthlyQuota,
        });

        // 2. Ensure default merchant settings exist
        const existingSettings = await merchantSettingsRepo.getSettings(instanceId);
        if (!existingSettings) {
          await merchantSettingsRepo.saveSettings(instanceId, {
            environment: 'TEST',
            defaultLabelFormat: 'PDF',
            enabledCarriers: ['USPS', 'FedEx', 'UPS', 'DHL'],
            fallbackRate: 10.0,
            defaultItemWeightOz: 16.0,
          });
          logger.info('WEBHOOK_INSTALL', 'Default merchant settings saved', { instanceId });
        }
      } catch (dbErr: any) {
        logger.error('WEBHOOK_INSTALL', 'Non-fatal database provisioning error', dbErr);
        // Do not crash the response — tenant can also lazily provision when opened in dashboard
      }

      return new Response(
        JSON.stringify({
          received: true,
          status: 'installed',
          instanceId,
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
