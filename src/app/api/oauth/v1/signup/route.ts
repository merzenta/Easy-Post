import { wixAppClient } from '@/app/utils/wix-sdk.app';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { withRequestLogging } from '@/app/utils/request-logger';
import { subscriptionRepo } from '@/app/repositories/subscription-repo';

export const GET = withRequestLogging(
  async function GET(request: NextRequest) {
    const { accessToken, instanceId, refreshToken } = await wixAppClient.auth.handleOAuthCallback(request.url);

    console.log('Received OAuth refresh and access tokens: ', {
      accessToken,
      refreshToken,
      instanceId,
    });

    if (instanceId) {
      try {
        await subscriptionRepo.getOrCreateSubscription(instanceId);
      } catch (err) {
        console.warn('OAuth signup: error initializing subscription:', err);
      }
    }

    return redirect(`https://www.wix.com/installer/close-window?access_token=${accessToken}`);
  },
  { moduleName: 'api/oauth/v1/signup' },
);
