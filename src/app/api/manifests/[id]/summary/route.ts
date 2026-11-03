import { NextRequest } from 'next/server';
import { scanFormRepo } from '@/app/repositories';
import { withRequestLogging } from '@/app/utils/request-logger';

export const GET = withRequestLogging(
  async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
    const scanFormId = params.id;
    if (!scanFormId) {
      return new Response(JSON.stringify({ error: 'SCAN Form ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const { searchParams } = new URL(request.url);
      const instanceId = searchParams.get('instanceId') || '';

      const scanForm = await scanFormRepo.getScanFormById(instanceId, scanFormId);
      if (!scanForm || !scanForm.form_url) {
        return new Response(JSON.stringify({ error: 'SCAN Form document not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return Response.redirect(scanForm.form_url, 302);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  { moduleName: 'api/manifests/[id]/summary' },
);
