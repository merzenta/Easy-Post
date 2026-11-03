import { wixAppClient } from '@/app/utils/wix-sdk.app';
import { type NextRequest } from 'next/server';
import { withRequestLogging } from '@/app/utils/request-logger';

export const POST = withRequestLogging(
  async function POST(request: NextRequest) {
    console.info('Webhook::install - called');
    const { eventType, instanceId, payload } = await wixAppClient.webhooks.processRequest(request, {
      expectedEvents: [wixAppClient.webhooks.apps.AppInstalled],
    });

    console.info('Webhook::install - input is:', {
      eventType,
      instanceId,
      payload,
    });

    return new Response('OK', {
      status: 200,
    });
  },
  { moduleName: 'api/webhooks/v1/install' },
);
