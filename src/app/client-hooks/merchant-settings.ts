'use client';

import { useAccessToken } from '@/app/client-hooks/access-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getMerchantSettingsAction,
  saveMerchantSettingsAction,
  validateEasyPostCredentialsAction,
} from '@/app/actions/app-data';
import { MerchantSettings } from '@/app/types/app-data.model';

const queryKey = ['merchant-settings'];

export const useMerchantSettings = () => {
  const accessTokenPromise = useAccessToken();
  return useQuery<MerchantSettings>({
    queryKey,
    queryFn: async () => {
      const accessToken = (await accessTokenPromise)!;
      return getMerchantSettingsAction({ accessToken });
    },
  });
};

export const useSaveMerchantSettings = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation({
    mutationFn: async (settings: Partial<MerchantSettings>) => {
      const accessToken = (await accessTokenPromise)!;
      return saveMerchantSettingsAction(settings, { accessToken });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ['shipping-app-data'] });
    },
  });
  return mutateAsync;
};

export const useValidateEasyPostKey = () => {
  const accessTokenPromise = useAccessToken();
  const { mutateAsync } = useMutation({
    mutationFn: async (apiKey: string) => {
      const accessToken = (await accessTokenPromise)!;
      return validateEasyPostCredentialsAction(apiKey, { accessToken });
    },
  });
  return mutateAsync;
};
