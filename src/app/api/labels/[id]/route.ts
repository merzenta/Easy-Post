import { NextRequest } from 'next/server';
import { shipmentRepo } from '@/app/repositories';
import { withRequestLogging } from '@/app/utils/request-logger';

export const GET = withRequestLogging(
  async function GET(request: NextRequest, { params }: { params: { id: string } }): Promise<Response> {
    const shipmentId = params.id;
    if (!shipmentId) {
      return new Response(JSON.stringify({ error: 'Shipment ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const { searchParams } = new URL(request.url);
      const instanceId = searchParams.get('instanceId') || '';

      const shipment = await shipmentRepo.getShipmentById(instanceId, shipmentId);
      if (!shipment || !shipment.label_url) {
        return new Response(JSON.stringify({ error: 'Postage label not found for shipment' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return Response.redirect(shipment.label_url, 302);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  { moduleName: 'api/labels/[id]' },
);
