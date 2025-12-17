import {
  DataClient,
  RewardActivity,
  RewardActivityInput,
  VendorSettings
} from '@countrtop/data';

export type LoyaltyConfig = {
  defaultEarnRate?: number;
  defaultRedeemRate?: number;
  punchValue?: number;
};

export type AccrualRequest = {
  userId: string;
  vendorId: string;
  orderId?: string;
  total: number;
  vendorSettings?: VendorSettings | null;
  description?: string;
  punches?: number;
  overridePoints?: number;
};

export type RedemptionRequest = {
  userId: string;
  vendorId: string;
  orderId?: string;
  points: number;
  description?: string;
};

export type LoyaltyResult = {
  balance: number;
  activity: RewardActivity;
};

const defaultConfig: Required<LoyaltyConfig> = {
  defaultEarnRate: 0.05,
  defaultRedeemRate: 0.01,
  punchValue: 10
};

export class LoyaltyService {
  private readonly config: Required<LoyaltyConfig>;

  constructor(private readonly dataClient: DataClient, config: LoyaltyConfig = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  accrueForOrder = async (request: AccrualRequest): Promise<LoyaltyResult> => {
    const earnRate = request.vendorSettings?.loyaltyEarnRate ?? this.config.defaultEarnRate;
    const punchPoints = (request.punches ?? 0) * this.config.punchValue;
    const calculatedPoints = Math.floor(request.total * earnRate) + punchPoints;
    const earned = Math.max(0, request.overridePoints ?? calculatedPoints);

    const activityInput: RewardActivityInput = {
      userId: request.userId,
      vendorId: request.vendorId,
      points: earned,
      type: 'earn',
      description: request.description ?? 'Loyalty accrual from order payment',
      occurredAt: new Date().toISOString(),
      orderId: request.orderId
    };

    const activity = await this.dataClient.recordRewardActivity(activityInput);
    const balance = await this.dataClient.adjustUserLoyaltyPoints(request.userId, earned);
    return { balance, activity };
  };

  redeemForOrder = async (request: RedemptionRequest): Promise<LoyaltyResult> => {
    const redeemAmount = Math.abs(request.points);
    const activityInput: RewardActivityInput = {
      userId: request.userId,
      vendorId: request.vendorId,
      points: -redeemAmount,
      type: 'redeem',
      description: request.description ?? 'Redeemed loyalty credit',
      occurredAt: new Date().toISOString(),
      orderId: request.orderId
    };

    const activity = await this.dataClient.recordRewardActivity(activityInput);
    const balance = await this.dataClient.adjustUserLoyaltyPoints(request.userId, -redeemAmount);
    return { balance, activity };
  };

  calculateRedeemableValue(points: number, vendorSettings?: VendorSettings | null): number {
    const redeemRate = vendorSettings?.loyaltyRedeemRate ?? this.config.defaultRedeemRate;
    return Math.max(0, points * redeemRate);
  }
}
