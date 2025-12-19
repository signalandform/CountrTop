import {
  createPaymentIntent,
  createSetupIntent,
  PaymentIntentPayload,
  PaymentIntentResponse,
  SetupIntentPayload,
  recordRewardActivity,
  RewardActivityRequest
} from '@countrtop/api-client';

type ApiClientConfig = {
  baseUrl?: string;
};

export const startPaymentIntent = async (
  payload: PaymentIntentPayload,
  config?: ApiClientConfig
): Promise<PaymentIntentResponse> => createPaymentIntent(payload, config);

export const startSetupIntent = async (
  payload: SetupIntentPayload,
  config?: ApiClientConfig
) => createSetupIntent(payload, config);

export const logRewardActivity = async (
  payload: RewardActivityRequest,
  config?: ApiClientConfig
) => recordRewardActivity(payload, config);
