import { AppStrategy } from '@wix/sdk/auth/wix-app-oauth';
import { createClient } from '@wix/sdk/client';
import { shippingRates } from '@wix/ecom/service-plugins';
import { orders, orderFulfillments } from '@wix/ecom';
import { normalizeWixPublicKey } from './wix-webhook-verifier';

export const wixAppClient = createClient({
  auth: AppStrategy({
    appId: process.env.WIX_APP_ID!,
    appSecret: process.env.WIX_APP_SECRET!,
    publicKey: normalizeWixPublicKey(process.env.WIX_APP_JWT_KEY),
  }),
  modules: {
    shippingRates,
    orders,
    orderFulfillments,
  },
});
