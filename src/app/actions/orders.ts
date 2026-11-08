'use server';

import { createSdk } from '@/app/utils/wix-sdk';
import { OrderSummary } from '@/app/types/order';
import { isTestingToken } from '@/app/utils/access-token';

export async function getLastOrders({ accessToken }: { accessToken: string }): Promise<OrderSummary[]> {
  try {
    if (isTestingToken(accessToken)) {
      const mocks = await import('@/app/utils/mocks-server');
      const testData = await mocks.getTestOrders();
      return (
        testData.orders?.map((order: any) => ({
          id: order.number ?? '',
          createdDate: order._createdDate ?? order.createdDate ?? '',
          totalPrice: order.priceSummary?.total?.amount ?? order.totalPriceBeforeTax?.amount ?? 0,
          currency: order.currency ?? 'USD',
        })) ?? []
      );
    }

    const sdk = createSdk(accessToken);
    const searchParams: any = {
      search: {
        cursorPaging: {
          limit: 3,
        },
      },
    };

    const res: any = await sdk.orders.searchOrders(searchParams);
    const ordersList: any[] = res?.orders || [];

    return ordersList.map((order: any) => ({
      id: order.number ?? '',
      createdDate: order._createdDate ?? order.createdDate ?? '',
      totalPrice: order.priceSummary?.total?.amount ?? 0,
      currency: order.currency ?? 'USD',
    }));
  } catch (e) {
    console.error('Failed to fetch orders.ts: ', e);
    return [];
  }
}

/**
 * Searches orders for the Orders & Fulfillment dashboard view
 */
export async function searchOrdersAction({ accessToken, limit = 25 }: { accessToken: string; limit?: number }) {
  if (isTestingToken(accessToken)) {
    const mocks = await import('@/app/utils/mocks-server');
    const mockData = await mocks.getTestOrders();
    return { orders: mockData.orders, totalCount: mockData.orders.length };
  }

  const sdk = createSdk(accessToken);
  try {
    const searchParams: any = {
      search: {
        cursorPaging: {
          limit,
        },
      },
    };

    const res: any = await sdk.orders.searchOrders(searchParams);

    return {
      orders: res?.orders || [],
      totalCount: res?.metadata?.count || res?.orders?.length || 0,
    };
  } catch (error) {
    console.error('searchOrdersAction error:', error);
    return { orders: [], totalCount: 0 };
  }
}
