import type { BillingPlanId } from '@countrtop/models';

/**
 * Feature gating by billing plan (Beta, Trial, Starter, Pro).
 * Used by API routes and can be used by UI to hide/disable sections.
 */
export function canUseLoyalty(planId: BillingPlanId): boolean {
  return planId === 'starter' || planId === 'pro';
}

export function canUseFeatureFlags(planId: BillingPlanId): boolean {
  return planId === 'starter' || planId === 'pro';
}

export function canUseCustomBranding(planId: BillingPlanId): boolean {
  return planId === 'starter' || planId === 'pro';
}

export function canUseMultipleLocations(planId: BillingPlanId): boolean {
  return planId === 'pro';
}

export function canUseAdvancedAnalytics(planId: BillingPlanId): boolean {
  return planId === 'starter' || planId === 'pro';
}

export function canUseScheduledOrders(planId: BillingPlanId): boolean {
  return planId === 'starter' || planId === 'pro';
}

export function canUseRoleBasedStaff(planId: BillingPlanId): boolean {
  return planId === 'pro';
}
