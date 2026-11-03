'use client';

import { useAccessToken } from '@/app/client-hooks/access-token';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSubscriptionSummaryAction,
  checkQuotaAction,
  updateSubscriptionTierAction,
} from '@/app/actions/subscription.action';
import { PlanTierType } from '@/app/types/subscription.model';

export const SUBSCRIPTION_QUERY_KEY = ['subscription-summary'];

/**
 * React Query hook to fetch the current merchant's subscription tier, usage progress, and quota status.
 */
export const useSubscriptionSummary = () => {
  const accessTokenPromise = useAccessToken();
  return useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: async () => {
      const accessToken = (await accessTokenPromise)!;
      return getSubscriptionSummaryAction({ accessToken });
    },
    staleTime: 1000 * 30, // 30 seconds
  });
};

/**
 * React Query hook to check if the current merchant has remaining quota.
 */
export const useCheckQuota = () => {
  const accessTokenPromise = useAccessToken();
  return useQuery({
    queryKey: ['quota-check'],
    queryFn: async () => {
      const accessToken = (await accessTokenPromise)!;
      return checkQuotaAction({ accessToken });
    },
  });
};

/**
 * Mutation hook to update or upgrade the merchant's subscription tier.
 */
export const useUpdateSubscriptionTier = () => {
  const accessTokenPromise = useAccessToken();
  const queryClient = useQueryClient();

  const { mutateAsync } = useMutation({
    mutationFn: async ({ planType, wixPackageId }: { planType: PlanTierType; wixPackageId?: string }) => {
      const accessToken = (await accessTokenPromise)!;
      return updateSubscriptionTierAction(planType, { accessToken }, wixPackageId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['quota-check'] });
    },
  });

  return mutateAsync;
};
