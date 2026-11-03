'use client';

import { useAccessToken } from '@/app/client-hooks/access-token';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { buyShipmentLabelAction, getLabelUrlAction } from '@/app/actions/easypost-labels';

const queryKey = ['labels'];

export const useBuyLabel = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async ({
      shipmentId,
      rateId,
      insuranceAmount,
    }: {
      shipmentId: string;
      rateId: string;
      insuranceAmount?: number;
    }) => {
      const accessToken = (await accessTokenPromise)!;
      return buyShipmentLabelAction(shipmentId, rateId, { accessToken }, insuranceAmount);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['wix-orders'] });
    },
  });
  return mutateAsync;
};

export const useGetLabelUrl = () => {
  const accessTokenPromise = useAccessToken();
  const { mutateAsync } = useMutation({
    mutationFn: async (shipmentId: string) => {
      const accessToken = (await accessTokenPromise)!;
      return getLabelUrlAction(shipmentId, { accessToken });
    },
  });
  return mutateAsync;
};
