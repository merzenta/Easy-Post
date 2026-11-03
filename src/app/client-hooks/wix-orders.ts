'use client';

import { useAccessToken } from '@/app/client-hooks/access-token';
import { useQuery } from '@tanstack/react-query';
import { searchOrdersAction } from '@/app/actions/orders';

const queryKey = ['wix-orders'];

export const useSearchOrders = (limit = 25) => {
  const accessTokenPromise = useAccessToken();
  return useQuery({
    queryKey: [...queryKey, limit],
    queryFn: async () => {
      const accessToken = (await accessTokenPromise)!;
      return searchOrdersAction({ accessToken, limit });
    },
  });
};
