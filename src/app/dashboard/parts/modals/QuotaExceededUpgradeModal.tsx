'use client';

import React from 'react';
import { Modal, CustomModalLayout, Box, Text, Badge, Button, LinearProgressBar } from '@wix/design-system';
import { useSubscriptionSummary } from '@/app/client-hooks/subscriptions';
import { SUBSCRIPTION_PLANS, PlanTierType } from '@/app/types/subscription.model';
import { useSDK } from '@/app/utils/wix-sdk.client-only';
import { openWixUpgradeCheckout } from '@/app/utils/wix-checkout';

export interface QuotaExceededUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToBilling?: () => void;
  onUpgradeSuccess?: () => void;
  details?: {
    planType: string;
    monthlyQuota: number;
    labelsGenerated: number;
    resetDate: string;
  };
  quotaDetails?: {
    planType?: string;
    monthlyQuota?: number;
    labelsGenerated?: number;
    resetDate?: string;
  };
}

export function QuotaExceededUpgradeModal({
  isOpen,
  onClose,
  onNavigateToBilling,
  details,
  quotaDetails,
}: QuotaExceededUpgradeModalProps) {
  const {
    dashboard: { showToast },
  } = useSDK();

  const { data: summary } = useSubscriptionSummary();

  if (!isOpen) return null;

  const effectiveDetails = details || quotaDetails;
  const currentPlanType: PlanTierType =
    (effectiveDetails?.planType as PlanTierType) || summary?.subscription?.planType || 'FREE';
  const currentPlan = SUBSCRIPTION_PLANS[currentPlanType] || SUBSCRIPTION_PLANS.FREE;
  const labelsGenerated = effectiveDetails?.labelsGenerated ?? summary?.currentUsage?.labelsGenerated ?? 5;
  const monthlyQuota = effectiveDetails?.monthlyQuota ?? summary?.subscription?.monthlyQuota ?? 5;
  const resetDate =
    effectiveDetails?.resetDate ||
    (summary?.subscription?.currentPeriodEnd
      ? new Date(summary.subscription.currentPeriodEnd).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'the 1st of next month');

  const handleUpgrade = (targetTier: PlanTierType) => {
    const targetConfig = SUBSCRIPTION_PLANS[targetTier];
    showToast({
      message: `Opening Wix App Market Checkout for ${targetConfig.name}...`,
      type: 'standard',
    });
    openWixUpgradeCheckout(targetConfig.wixPackageId);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onRequestClose={onClose} shouldCloseOnOverlayClick={true}>
      <CustomModalLayout
        title='Monthly Label Limit Reached'
        subtitle={`You have reached your limit of ${monthlyQuota} shipping labels for the ${currentPlan.name} this month.`}
        primaryButtonText='Cancel / Wait for Reset'
        primaryButtonOnClick={onClose}
        secondaryButtonText={onNavigateToBilling ? 'View All 4 Plans' : undefined}
        secondaryButtonOnClick={() => {
          onClose();
          if (onNavigateToBilling) onNavigateToBilling();
        }}
        onCloseButtonClick={onClose}
        width='640px'
      >
        <Box direction='vertical' gap='SP4'>
          {/* Current Status Banner */}
          <div
            style={{
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: '#fff5f5',
              border: '1px solid #fed7d7',
            }}
          >
            <Box direction='vertical' gap='SP2'>
              <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                <Box gap='SP2' verticalAlign='middle'>
                  <Text weight='bold' size='small'>
                    Current Plan: {currentPlan.name}
                  </Text>
                  <Badge skin='danger' size='small'>
                    QUOTA EXHAUSTED
                  </Badge>
                </Box>
                <Text size='tiny' secondary>
                  Resets: {resetDate}
                </Text>
              </Box>

              <Text size='small'>
                You have generated{' '}
                <strong>
                  {labelsGenerated} of {monthlyQuota} labels
                </strong>{' '}
                for this billing cycle. Your quota will automatically reset on <strong>{resetDate}</strong>.
              </Text>

              <div style={{ marginTop: '4px' }}>
                <LinearProgressBar value={100} skin='warning' />
              </div>
            </Box>
          </div>

          {/* Contextual Value Proposition */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#f0f6ff',
              border: '1px solid #cce0ff',
            }}
          >
            <Text size='small'>
              Upgrade to the <strong>Starter Plan ($5/month)</strong> to unlock 50 shipping labels immediately, or{' '}
              <strong>Unlimited ($20/month)</strong> for unrestricted fulfillment.
            </Text>
          </div>

          {/* Quick Upgrade Tier Cards */}
          <Box direction='horizontal' gap='SP3'>
            {/* Starter Tier Card */}
            <div
              style={{
                flex: 1,
                border: '1px solid #dfe5eb',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <Box direction='vertical' gap='SP1'>
                <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                  <Text weight='bold' size='medium'>
                    Starter Plan
                  </Text>
                  <Badge skin='standard' size='small'>
                    POPULAR
                  </Badge>
                </Box>
                <Text weight='bold' size='medium' style={{ color: '#0055ff', fontSize: '20px' }}>
                  $5.00 <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>/ month</span>
                </Text>
                <Text size='small' secondary>
                  50 shipping labels every month.
                </Text>
              </Box>

              <Box direction='vertical' gap='SP1'>
                <Text size='tiny'>&bull; 50 postage labels / month</Text>
                <Text size='tiny'>&bull; Auto cartonization & box packer</Text>
                <Text size='tiny'>&bull; Carrier SCAN Form manifests</Text>
              </Box>

              <Button size='small' priority='primary' onClick={() => handleUpgrade('STARTER')}>
                Upgrade to Starter ($5/mo)
              </Button>
            </div>

            {/* Unlimited Tier Card */}
            <div
              style={{
                flex: 1,
                border: '2px solid #0055ff',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: '#f8fbff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <Box direction='vertical' gap='SP1'>
                <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                  <Text weight='bold' size='medium'>
                    Unlimited Plan
                  </Text>
                  <Badge skin='success' size='small'>
                    BEST VALUE
                  </Badge>
                </Box>
                <Text weight='bold' size='medium' style={{ color: '#16803c', fontSize: '20px' }}>
                  $20.00 <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#666' }}>/ month</span>
                </Text>
                <Text size='small' secondary>
                  Zero limits. Uncapped fulfillment volume.
                </Text>
              </Box>

              <Box direction='vertical' gap='SP1'>
                <Text size='tiny'>&bull; Unlimited postage labels</Text>
                <Text size='tiny'>&bull; No overage fees or monthly caps</Text>
                <Text size='tiny'>&bull; Priority EasyPost dispatch</Text>
              </Box>

              <Button size='small' skin='premium' priority='primary' onClick={() => handleUpgrade('UNLIMITED')}>
                Upgrade to Unlimited ($20/mo)
              </Button>
            </div>
          </Box>

          {/* Footer note */}
          <Box direction='horizontal' align='space-between' verticalAlign='middle'>
            <Text size='tiny' secondary>
              Billed monthly via Wix App Market. Cancel or switch anytime.
            </Text>
            {onNavigateToBilling && (
              <Button
                size='tiny'
                priority='secondary'
                onClick={() => {
                  onClose();
                  onNavigateToBilling();
                }}
              >
                Compare All 4 Plans &rarr;
              </Button>
            )}
          </Box>
        </Box>
      </CustomModalLayout>
    </Modal>
  );
}
