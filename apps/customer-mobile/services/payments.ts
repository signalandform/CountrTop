import { useCallback, useState } from 'react';

import {
  createPaymentIntent,
  createSetupIntent,
  PaymentIntentPayload,
  SetupIntentPayload,
  recordRewardActivity,
  RewardActivityRequest
} from '@countrtop/api-client';

type ApiClientConfig = {
  baseUrl?: string;
};

export const usePaymentIntentService = (config?: ApiClientConfig) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startPayment = useCallback(
    async (payload: PaymentIntentPayload) => {
      setLoading(true);
      setError(null);

      const result = await createPaymentIntent(payload, config);
      if (!result.ok) {
        setError(result.error ?? 'Unable to create payment intent');
      }

      setLoading(false);
      return result;
    },
    [config]
  );

  return { startPayment, loading, error };
};

export const useSetupIntentService = (config?: ApiClientConfig) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startSetup = useCallback(
    async (payload: SetupIntentPayload) => {
      setLoading(true);
      setError(null);

      const result = await createSetupIntent(payload, config);
      if (!result.ok) {
        setError(result.error ?? 'Unable to create setup intent');
      }

      setLoading(false);
      return result;
    },
    [config]
  );

  return { startSetup, loading, error };
};

export const useRewardActivityService = (config?: ApiClientConfig) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordActivity = useCallback(
    async (payload: RewardActivityRequest) => {
      setSaving(true);
      setError(null);
      const result = await recordRewardActivity(payload, config);
      if (!result.ok) {
        setError(result.error ?? 'Unable to record reward activity');
      }
      setSaving(false);
      return result;
    },
    [config]
  );

  return { recordActivity, saving, error };
};
