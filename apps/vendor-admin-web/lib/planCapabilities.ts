import type { BillingPlanId } from '@countrtop/models';

/** Plans that can use the CRM feature. */
export function canUseCrm(planId: BillingPlanId): boolean {
  return planId === 'pro' || planId === 'starter';
}
