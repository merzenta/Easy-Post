'use client';

import React from 'react';
import { Box, Card, Text, Badge, Button, LinearProgressBar, Loader } from '@wix/design-system';
import { useSubscriptionSummary } from '@/app/client-hooks/subscriptions';
import { SUBSCRIPTION_PLANS, PlanTierType } from '@/app/types/subscription.model';
import { useSDK } from '@/app/utils/wix-sdk.client-only';
import { openWixUpgradeCheckout, openWixSubscriptionManagement } from '@/app/utils/wix-checkout';

export interface BillingTabProps {
  onNavigateTab?: (tabId: string) => void;
}

export function BillingTab({ onNavigateTab }: BillingTabProps) {
  const {
    dashboard: { showToast },
  } = useSDK();

  const { data: summary, isLoading, refetch } = useSubscriptionSummary();

  const activePlanType: PlanTierType = summary?.subscription?.planType || 'FREE';
  const activePlan = SUBSCRIPTION_PLANS[activePlanType] || SUBSCRIPTION_PLANS.FREE;
  const currentUsage = summary?.currentUsage?.labelsGenerated ?? 0;
  const monthlyQuota = summary?.subscription?.monthlyQuota ?? activePlan.monthlyLabelQuota;
  const isUnlimited = monthlyQuota === -1;

  const usagePercent = isUnlimited ? 0 : Math.min(100, Math.round((currentUsage / Math.max(1, monthlyQuota)) * 100));

  const progressSkin: 'warning' | 'success' | 'standard' = usagePercent >= 75 ? 'warning' : 'success';

  const resetDateFormatted = summary?.subscription?.currentPeriodEnd
    ? new Date(summary.subscription.currentPeriodEnd).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '1st of next month';

  const handleUpgradeToPlan = (targetTier: PlanTierType) => {
    const targetConfig = SUBSCRIPTION_PLANS[targetTier];
    showToast({
      message: `Opening Wix App Market Checkout for ${targetConfig.name}...`,
      type: 'standard',
    });
    openWixUpgradeCheckout(targetConfig.wixPackageId);
  };

  const handleManageSubscription = () => {
    showToast({
      message: 'Opening Wix Subscriptions & Billing manager...',
      type: 'standard',
    });
    openWixSubscriptionManagement();
  };

  const allTiers: PlanTierType[] = ['FREE', 'STARTER', 'GROWTH', 'UNLIMITED'];

  return (
    <Box direction='vertical' gap='SP4'>
      {/* 1. Current Plan & Usage Summary Card */}
      <Card hideOverflow>
        <Card.Header
          title='Current Subscription & Label Quota'
          subtitle='Monitor your monthly postage label allowance, plan tier, and renewal cycle.'
          suffix={
            <Button size='small' priority='secondary' onClick={() => refetch()}>
              Refresh Status
            </Button>
          }
        />
        <Card.Divider />
        <Card.Content>
          {isLoading ? (
            <Box height='140px' verticalAlign='middle' align='center'>
              <Loader size='medium' />
            </Box>
          ) : (
            <Box direction='vertical' gap='SP3'>
              {/* Plan Row */}
              <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                <Box direction='horizontal' gap='SP2' verticalAlign='middle'>
                  <Text weight='bold' size='medium'>
                    {activePlan.name}
                  </Text>
                  <Badge skin={activePlan.badgeColor} size='small'>
                    {summary?.subscription?.status || 'ACTIVE'}
                  </Badge>
                  {isUnlimited && (
                    <Badge skin='success' size='small'>
                      UNLIMITED VOLUME
                    </Badge>
                  )}
                </Box>
                <Text size='small' secondary>
                  Monthly Cycle Resets: <strong>{resetDateFormatted}</strong>
                </Text>
              </Box>

              {/* Progress Bar & Details */}
              <Box direction='vertical' gap='SP2'>
                <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                  <Text size='small'>
                    Monthly Usage:{' '}
                    <strong>
                      {currentUsage} {isUnlimited ? 'labels generated' : `of ${monthlyQuota} labels used`}
                    </strong>{' '}
                    {!isUnlimited && `(${usagePercent}%)`}
                  </Text>
                  {!isUnlimited && (
                    <Text size='small' weight='bold' style={{ color: usagePercent >= 100 ? '#d92c20' : '#16803c' }}>
                      {Math.max(0, monthlyQuota - currentUsage)} labels remaining
                    </Text>
                  )}
                </Box>

                {!isUnlimited && (
                  <div style={{ width: '100%' }}>
                    <LinearProgressBar value={usagePercent} skin={progressSkin} />
                  </div>
                )}
              </Box>

              {/* Status Hint */}
              {usagePercent >= 100 && !isUnlimited ? (
                <div
                  style={{
                    backgroundColor: '#fff5f5',
                    border: '1px solid #fed7d7',
                    borderRadius: '6px',
                    padding: '10px 14px',
                  }}
                >
                  <Text size='small' style={{ color: '#c53030' }}>
                    <strong>Notice:</strong> You have reached your monthly limit of {monthlyQuota} labels. Choose a
                    higher plan below to upgrade through Wix App Market and continue purchasing labels immediately.
                  </Text>
                </div>
              ) : usagePercent >= 80 && !isUnlimited ? (
                <div
                  style={{
                    backgroundColor: '#fffaf0',
                    border: '1px solid #feebc8',
                    borderRadius: '6px',
                    padding: '10px 14px',
                  }}
                >
                  <Text size='small' style={{ color: '#c05621' }}>
                    <strong>Notice:</strong> You have used {usagePercent}% of your monthly allowance. Upgrade to avoid
                    any shipping delays when your allowance is reached.
                  </Text>
                </div>
              ) : null}
            </Box>
          )}
        </Card.Content>
      </Card>

      {/* 2. Available Subscription Plans Comparison Cards */}
      <Card hideOverflow>
        <Card.Header
          title='Available Subscription Plans'
          subtitle='Select the plan that fits your fulfillment needs. Billed monthly via Wix App Market.'
        />
        <Card.Divider />
        <Card.Content>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: '16px',
              width: '100%',
            }}
          >
            {allTiers.map((tierKey) => {
              const plan = SUBSCRIPTION_PLANS[tierKey];
              const isCurrent = activePlanType === tierKey;
              const isRecommended = tierKey === 'STARTER';

              return (
                <div
                  key={tierKey}
                  style={{
                    border: isCurrent ? '2px solid #0055ff' : isRecommended ? '2px solid #00c776' : '1px solid #dfe5eb',
                    borderRadius: '10px',
                    backgroundColor: isCurrent ? '#f8fbff' : '#ffffff',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '16px',
                    boxShadow: isCurrent ? '0 4px 12px rgba(0, 85, 255, 0.08)' : 'none',
                    position: 'relative',
                  }}
                >
                  {/* Top Badges */}
                  <Box direction='vertical' gap='SP2'>
                    <Box direction='horizontal' align='space-between' verticalAlign='middle'>
                      <Text weight='bold' size='medium'>
                        {plan.name}
                      </Text>
                      {isCurrent ? (
                        <Badge skin='standard' size='small'>
                          CURRENT
                        </Badge>
                      ) : isRecommended ? (
                        <Badge skin='success' size='small'>
                          POPULAR
                        </Badge>
                      ) : null}
                    </Box>

                    {/* Price */}
                    <Box direction='vertical' gap='SP1'>
                      <Box direction='horizontal' verticalAlign='bottom' gap='SP1'>
                        <Text weight='bold' size='medium' style={{ fontSize: '26px', lineHeight: 1.2 }}>
                          ${plan.monthlyPriceUSD.toFixed(0)}
                        </Text>
                        <Text size='small' secondary>
                          / month
                        </Text>
                      </Box>
                      {plan.yearlyDiscountPercent ? (
                        <Text size='tiny' style={{ color: '#166534', fontWeight: 600 }}>
                          Recurring &bull; {plan.yearlyDiscountPercent}% yearly discount
                        </Text>
                      ) : (
                        <Text size='tiny' secondary>
                          Free to Install
                        </Text>
                      )}
                    </Box>

                    {/* Quota Highlight */}
                    <div
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#f4f6f8',
                        borderRadius: '6px',
                        marginTop: '4px',
                      }}
                    >
                      <Text weight='bold' size='small' style={{ color: '#162d3d' }}>
                        {plan.monthlyLabelQuota === -1
                          ? 'Unlimited postage labels'
                          : `${plan.monthlyLabelQuota} labels / month`}
                      </Text>
                    </div>

                    <Text size='tiny' secondary>
                      {plan.description}
                    </Text>

                    {/* Features list */}
                    <div style={{ marginTop: '10px' }}>
                      <Box direction='vertical' gap='SP1'>
                        {plan.features.map((feat, idx) => (
                          <Box key={idx} direction='horizontal' gap='SP1' verticalAlign='top'>
                            <Text size='tiny' style={{ color: '#0055ff' }}>
                              &#10003;
                            </Text>
                            <Text size='tiny'>{feat}</Text>
                          </Box>
                        ))}
                      </Box>
                    </div>
                  </Box>

                  {/* Single Clean Production Action Button */}
                  <div style={{ marginTop: 'auto', paddingTop: '12px' }}>
                    {isCurrent ? (
                      <Button size='small' priority='secondary' disabled style={{ width: '100%' }}>
                        Active Plan
                      </Button>
                    ) : tierKey === 'FREE' ? (
                      <Button
                        size='small'
                        priority='secondary'
                        style={{ width: '100%' }}
                        onClick={handleManageSubscription}
                      >
                        Manage on Wix
                      </Button>
                    ) : (
                      <Button
                        size='small'
                        priority='primary'
                        skin={tierKey === 'UNLIMITED' ? 'premium' : 'standard'}
                        style={{ width: '100%' }}
                        onClick={() => handleUpgradeToPlan(tierKey)}
                      >
                        Upgrade to {plan.name} (${plan.monthlyPriceUSD}/mo)
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card.Content>
      </Card>

      {/* 3. Billing & Fulfillment FAQ */}
      <Card hideOverflow>
        <Card.Header
          title='Billing & Quota Frequently Asked Questions'
          subtitle='Learn how subscription billing, quota consumption, and resets operate.'
        />
        <Card.Divider />
        <Card.Content>
          <Box direction='vertical' gap='SP3'>
            <div>
              <Text weight='bold' size='small'>
                How does subscription billing work on Wix?
              </Text>
              <Text size='small' secondary>
                All plan subscriptions are securely processed through Wix App Market billing. Charges are consolidated
                into your monthly Wix invoice with no separate credit cards required.
              </Text>
            </div>

            <div>
              <Text weight='bold' size='small'>
                When does my label quota reset?
              </Text>
              <Text size='small' secondary>
                Your quota resets automatically at midnight UTC on the 1st of every calendar month. Unused labels do not
                roll over to the subsequent month.
              </Text>
            </div>

            <div>
              <Text weight='bold' size='small'>
                What happens when I upgrade my plan mid-month?
              </Text>
              <Text size='small' secondary>
                Upgrading immediately unlocks the higher quota tier so you can continue generating labels without delay.
                Any labels already generated during the current month count toward your new allowance.
              </Text>
            </div>

            <div>
              <Text weight='bold' size='small'>
                Can I switch or cancel my plan at any time?
              </Text>
              <Text size='small' secondary>
                Yes, you can upgrade, downgrade, or cancel your subscription at any time directly through Wix Account
                Settings under Subscriptions & Billing.
              </Text>
            </div>
          </Box>
        </Card.Content>
      </Card>
    </Box>
  );
}
