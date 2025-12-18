import { useCallback, useState } from 'react';

import {
  CheckoutIntentPayload,
  initiateCheckout,
  recordRewardActivity,
  RewardActivityRequest
} from '@countrtop/api-client';

type ApiClientConfig = {
  baseUrl?: string;
};

export const useCheckoutService = (config?: ApiClientConfig) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = useCallback(
    async (payload: CheckoutIntentPayload) => {
      setLoading(true);
      setError(null);

      const result = await initiateCheckout(payload, config);
      if (!result.ok) {
        setError(result.error ?? 'Unable to start checkout');
      }

      setLoading(false);
      return result;
    },
    [config]
  );

  return { startCheckout, loading, error };
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
