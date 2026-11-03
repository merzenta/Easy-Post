'use client';

import { useAccessToken } from '@/app/client-hooks/access-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listShipmentsAction,
  createShipmentForOrderAction,
  deleteShipmentAction,
  syncOrderFulfillmentAction,
  CreateShipmentParams,
  FulfillmentSyncParams,
} from '@/app/actions/easypost-shipments';
import { EasyPostShipment, EasyPostShipmentStatus } from '@/app/types/easypost.model';

const queryKey = ['shipments'];

export const useShipments = (filter?: { status?: EasyPostShipmentStatus; limit?: number }) => {
  const accessTokenPromise = useAccessToken();
  return useQuery<EasyPostShipment[]>({
    queryKey: [...queryKey, filter],
    queryFn: async () => {
      const accessToken = (await accessTokenPromise)!;
      return listShipmentsAction({ accessToken }, filter);
    },
  });
};

export const useCreateShipment = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async (params: CreateShipmentParams) => {
      const accessToken = (await accessTokenPromise)!;
      return createShipmentForOrderAction(params, { accessToken });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['wix-orders'] });
    },
  });
  return mutateAsync;
};

export const useDeleteShipment = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async (shipmentId: string) => {
      const accessToken = (await accessTokenPromise)!;
      return deleteShipmentAction(shipmentId, { accessToken });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  return mutateAsync;
};

export const useSyncOrderFulfillment = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async (params: FulfillmentSyncParams) => {
      const accessToken = (await accessTokenPromise)!;
      return syncOrderFulfillmentAction(params, { accessToken });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['wix-orders'] });
    },
  });
  return mutateAsync;
};
