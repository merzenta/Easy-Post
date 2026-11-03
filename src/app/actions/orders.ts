'use server';

import { createSdk } from '@/app/utils/wix-sdk';
import { OrderSummary } from '@/app/types/order';
import { isTestingToken } from '@/app/utils/access-token';

export async function getLastOrders({ accessToken }: { accessToken: string }): Promise<OrderSummary[]> {
  const sdk = createSdk(accessToken);
  return (
    isTestingToken(accessToken)
      ? (await import('@/app/utils/mocks-server')).getTestOrders()
      : sdk.orders.searchOrders({
          search: {
            cursorPaging: {
              limit: 3,
            },
          },
        })
  )
    .then((res) => {
      return (
        res.orders?.map(
          (order) =>
            ({
              id: order.number ?? '',
              createdDate: order?._createdDate ?? '',
              totalPrice: order?.priceSummary?.total?.amount ?? 0,
              currency: order?.currency ?? 'USD',
            }) as OrderSummary,
        ) ?? []
      );
    })
    .catch((e) => {
      console.error('Failed to fetch orders.ts: ', e);
      return [];
    });
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
    const res = await sdk.orders.searchOrders({
      search: {
        cursorPaging: {
          limit,
        },
      },
    });

    return {
      orders: res.orders || [],
      totalCount: res.metadata?.count || res.orders?.length || 0,
    };
  } catch (error) {
    console.error('searchOrdersAction error:', error);
    return { orders: [], totalCount: 0 };
  }
}
