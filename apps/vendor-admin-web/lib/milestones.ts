/**
 * Order milestone tiers for CountrTop online orders.
 * Used for celebratory banners and incentive CTAs (shirt, plaque).
 */

export type MilestoneSeen = { milestone: number };

export type MilestoneType = 'congrats' | 'incentive_shirt' | 'incentive_plaque';

export type MilestoneConfig = {
  milestone: number;
  milestoneType: MilestoneType;
  message: string;
  /** CTA for incentives (e.g. "Contact support to claim") */
  cta?: string;
};

/** Ordered milestone tiers (low to high) */
export const MILESTONE_TIERS: MilestoneConfig[] = [
  { milestone: 10, milestoneType: 'congrats', message: "10 orders! You're on your way." },
  { milestone: 25, milestoneType: 'congrats', message: '25 orders – nice momentum!' },
  { milestone: 50, milestoneType: 'congrats', message: '50 orders! Halfway to 100.' },
  { milestone: 100, milestoneType: 'congrats', message: "100 orders! Century club." },
  { milestone: 250, milestoneType: 'congrats', message: "250 orders – you're building something great." },
  {
    milestone: 500,
    milestoneType: 'incentive_shirt',
    message: '500 orders! Claim your free CountrTop t-shirt.',
    cta: 'Contact support to claim.'
  },
  {
    milestone: 1000,
    milestoneType: 'incentive_plaque',
    message: '1,000 orders! Request your CountrTop recognition plaque.',
    cta: 'Contact support to claim.'
  },
  { milestone: 2500, milestoneType: 'congrats', message: "2,500 orders – you're crushing it." },
  { milestone: 5000, milestoneType: 'congrats', message: '5,000 orders! Incredible milestone.' },
  { milestone: 10000, milestoneType: 'congrats', message: "10,000 orders! You've built something amazing." }
];

/**
 * Returns milestones that have been crossed by totalOrders, ordered ascending.
 * Use this to determine which banners to show (filter by which are not yet in milestonesSeen).
 */
export function getMilestonesForCount(totalOrders: number): MilestoneConfig[] {
  return MILESTONE_TIERS.filter((tier) => totalOrders >= tier.milestone);
}

/**
 * Returns the first crossed milestone that the vendor has not yet seen.
 * Used to show a single banner at a time.
 */
export function getFirstUnseenMilestone(
  totalOrders: number,
  milestonesSeen: MilestoneSeen[]
): MilestoneConfig | null {
  const seenSet = new Set(milestonesSeen.map((m) => m.milestone));
  for (const tier of MILESTONE_TIERS) {
    if (totalOrders >= tier.milestone && !seenSet.has(tier.milestone)) {
      return tier;
    }
  }
  return null;
}
