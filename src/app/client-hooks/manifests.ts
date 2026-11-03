'use client';

import { useAccessToken } from '@/app/client-hooks/access-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listScanFormsAction, createScanFormManifestAction, getScanFormAction } from '@/app/actions/easypost-manifests';
import { EasyPostScanForm } from '@/app/types/easypost.model';

const queryKey = ['manifests'];

export const useManifests = (limit?: number) => {
  const accessTokenPromise = useAccessToken();
  return useQuery<EasyPostScanForm[]>({
    queryKey: [...queryKey, limit],
    queryFn: async () => {
      const accessToken = (await accessTokenPromise)!;
      return listScanFormsAction({ accessToken }, limit);
    },
  });
};

export const useCreateManifest = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async (shipmentIds: string[]) => {
      const accessToken = (await accessTokenPromise)!;
      return createScanFormManifestAction(shipmentIds, { accessToken });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['shipments'] });
    },
  });
  return mutateAsync;
};

export const useGetScanForm = (scanFormId?: string) => {
  const accessTokenPromise = useAccessToken();
  return useQuery<EasyPostScanForm | null>({
    queryKey: [...queryKey, scanFormId],
    queryFn: async () => {
      if (!scanFormId) return null;
      const accessToken = (await accessTokenPromise)!;
      return getScanFormAction(scanFormId, { accessToken });
    },
    enabled: !!scanFormId,
  });
};
