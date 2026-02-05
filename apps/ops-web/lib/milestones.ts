/**
 * Incentive milestones for ops fulfillment (shirt at 500, plaque at 1000).
 * Used for validation and display in ops dashboard.
 */

export const INCENTIVE_MILESTONES = [500, 1000] as const;

export const INCENTIVE_LABELS: Record<number, string> = {
  500: '500 orders – T-shirt',
  1000: '1,000 orders – Plaque'
};

export function getMilestoneLabel(milestone: number): string {
  return INCENTIVE_LABELS[milestone] ?? `${milestone} orders`;
}

export function isIncentiveMilestone(milestone: number): boolean {
  return (INCENTIVE_MILESTONES as readonly number[]).includes(milestone);
}
