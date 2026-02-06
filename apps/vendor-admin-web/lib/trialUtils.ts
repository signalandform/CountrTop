import type { VendorBilling } from '@countrtop/models';

/** Returns true if plan is trial and trial has ended. */
export function isTrialExpired(billing: VendorBilling | null): boolean {
  if (!billing || billing.planId !== 'trial') return false;
  const endsAt = billing.trialEndsAt;
  if (!endsAt) return false;
  return new Date(endsAt) < new Date();
}
