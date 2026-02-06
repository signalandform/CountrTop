import type { BillingPlanId } from '@countrtop/models';

/** Plans that can use custom branding (logo, colors, etc.). */
export function canUseCustomBranding(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** Plans that can use the loyalty/points feature. */
export function canUseLoyalty(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** Plans that can use the CRM feature. */
export function canUseCrm(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** CRM promotional emails allowed per calendar month (UTC). beta/trial cannot use CRM. */
export function getCrmEmailLimit(planId: BillingPlanId): number {
  if (planId === 'pro') return 500;
  if (planId === 'starter') return 100;
  return 0;
}

/** Plans that can use feature flags. */
export function canUseFeatureFlags(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** Plans that can use multiple locations. */
export function canUseMultipleLocations(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}
