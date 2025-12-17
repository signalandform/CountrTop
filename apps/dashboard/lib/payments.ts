import {
  CheckoutIntentPayload,
  CheckoutIntentResponse,
  initiateCheckout,
  recordRewardActivity,
  RewardActivityRequest
} from '@countrtop/api-client';

type ApiClientConfig = {
  baseUrl?: string;
};

export const startCheckout = async (
  payload: CheckoutIntentPayload,
  config?: ApiClientConfig
): Promise<CheckoutIntentResponse> => initiateCheckout(payload, config);

export const logRewardActivity = async (
  payload: RewardActivityRequest,
  config?: ApiClientConfig
) => recordRewardActivity(payload, config);
