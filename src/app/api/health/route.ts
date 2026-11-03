import { NextResponse } from 'next/server';
import { withRequestLogging } from '@/app/utils/request-logger';
import { prisma } from '@/app/utils/prisma';

export const GET = withRequestLogging(
  async function GET(): Promise<Response> {
    const timestamp = new Date().toISOString();
    let databaseHealthy = true;
    let databaseError: string | undefined;

    try {
      if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
        throw new Error('DATABASE_URL environment variable is not defined.');
      }
      await prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      databaseHealthy = false;
      databaseError = err?.message || String(err);
      console.error('Health check database query failure:', err);
    }

    const isHealthy = databaseHealthy;

    return NextResponse.json(
      {
        status: isHealthy ? 'healthy' : 'degraded',
        name: 'wix-easypost-integration',
        version: '0.1.0',
        timestamp,
        uptimeSeconds: Math.floor(process.uptime()),
        checks: {
          database: {
            healthy: databaseHealthy,
            provider: 'postgresql',
            ...(databaseError ? { error: databaseError } : {}),
          },
          easypostApi: {
            endpoint: 'https://api.easypost.com/v2',
            supportedCarriers: ['USPS', 'FedEx', 'UPS', 'DHL'],
          },
          wixSpis: {
            shippingRatesV1: '/api/shipping-rates/v1/getRates',
            webhooksV1Orders: '/api/webhooks/v1/orders',
          },
        },
      },
      {
        status: isHealthy ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      },
    );
  },
  { moduleName: 'api/health' },
);
