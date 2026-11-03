'use client';

import { useAccessToken } from '@/app/client-hooks/access-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listTrackingRecordsAction,
  trackShipmentAction,
  getTrackingRecordAction,
} from '@/app/actions/easypost-tracking';
import { EasyPostTrackingRecord } from '@/app/types/easypost.model';

const queryKey = ['tracking'];

export const useTrackingRecords = (filter?: { hasException?: boolean; isDelivered?: boolean }) => {
  const accessTokenPromise = useAccessToken();
  return useQuery<EasyPostTrackingRecord[]>({
    queryKey: [...queryKey, filter],
    queryFn: async () => {
      const accessToken = (await accessTokenPromise)!;
      return listTrackingRecordsAction({ accessToken }, filter);
    },
  });
};

export const useTrackShipment = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async ({ trackingCode, carrier }: { trackingCode: string; carrier?: string }) => {
      const accessToken = (await accessTokenPromise)!;
      return trackShipmentAction(trackingCode, carrier, { accessToken });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
  return mutateAsync;
};

export const useGetTrackingRecord = (trackingCode?: string) => {
  const accessTokenPromise = useAccessToken();
  return useQuery<EasyPostTrackingRecord | null>({
    queryKey: [...queryKey, trackingCode],
    queryFn: async () => {
      if (!trackingCode) return null;
      const accessToken = (await accessTokenPromise)!;
      return getTrackingRecordAction(trackingCode, { accessToken });
    },
    enabled: !!trackingCode,
  });
};
