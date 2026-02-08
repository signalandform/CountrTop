import type { BillingPlanId, VendorIntake } from '@countrtop/models';

/** Plans that can use custom branding (logo, colors, etc.). */
export function canUseCustomBranding(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** Plans that can use the loyalty/points feature (plan-level only). */
export function canUseLoyalty(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** Plans that can use the CRM feature (plan-level only). */
export function canUseCrm(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** CRM promotional emails allowed per calendar month (UTC). Trial (free tier) cannot use CRM. */
export function getCrmEmailLimit(planId: BillingPlanId): number {
  if (planId === 'pro') return 500;
  if (planId === 'starter') return 100;
  return 0;
}

/** Plans that can use feature flags. */
export function canUseFeatureFlags(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}

/** Plans that can use multiple locations. Pro only. */
export function canUseMultipleLocations(planId: BillingPlanId): boolean {
  return planId === 'pro';
}

// -----------------------------------------------------------------------------
// Module-level gating (plan + intake): if intake says "no", return false; else use plan rules.
// -----------------------------------------------------------------------------

/** KDS: intake must want it; plan gate (kds_only, starter, pro — paid required for live KDS). */
export function canUseKdsModule(planId: BillingPlanId, intake: VendorIntake | null): boolean {
  if (intake && !intake.needsKds) return false;
  return planId === 'kds_only' || planId === 'starter' || planId === 'pro';
}

/** Online ordering: intake must want it; plan gate (online_only, starter, pro). */
export function canUseOnlineOrderingModule(planId: BillingPlanId, intake: VendorIntake | null): boolean {
  if (intake && !intake.needsOnlineOrdering) return false;
  return planId === 'online_only' || planId === 'starter' || planId === 'pro';
}

/** Scheduled orders: intake must want it; plan gate (online_only, starter, pro). */
export function canUseScheduledOrdersModule(planId: BillingPlanId, intake: VendorIntake | null): boolean {
  if (intake && !intake.needsScheduledOrders) return false;
  return planId === 'online_only' || planId === 'starter' || planId === 'pro';
}

/** Loyalty: intake must want it; plan gate (starter/pro). */
export function canUseLoyaltyModule(planId: BillingPlanId, intake: VendorIntake | null): boolean {
  if (intake && !intake.needsLoyalty) return false;
  return planId === 'pro' || planId === 'starter';
}

/** CRM: intake must want it; plan gate (starter/pro). */
export function canUseCrmModule(planId: BillingPlanId, intake: VendorIntake | null): boolean {
  if (intake && !intake.needsCrm) return false;
  return planId === 'pro' || planId === 'starter';
}

/** Employee time tracking: intake must want it; plan gate (starter/pro). */
export function canUseTimeTrackingModule(planId: BillingPlanId, intake: VendorIntake | null): boolean {
  if (intake && !intake.needsTimeTracking) return false;
  return planId === 'pro' || planId === 'starter';
}
