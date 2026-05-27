import { useCallback } from 'react';

import useApiConfig from '@app/stores/apiConfig';
import { useUserStore } from '@app/stores/userStore';
import { callApi } from '@app/utils/api';
import { type CloudConfigResponse, CloudConfigResponseSchema } from '@promptfoo/types/api/user';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export type CloudConfigData = CloudConfigResponse;

// Keyed on apiBaseUrl + signed-in email so a change to either invalidates
// the cached config automatically — replaces the previous manual
// event-bus + dual Zustand-subscription dance.
function useCloudConfigQueryKey() {
  const apiBaseUrl = useApiConfig((s) => s.apiBaseUrl);
  const email = useUserStore((s) => s.email);
  return ['cloudConfig', apiBaseUrl, email] as const;
}

async function fetchCloudConfig(): Promise<CloudConfigData> {
  const response = await callApi('/user/cloud-config');
  if (!response.ok) {
    throw new Error('Failed to fetch cloud config');
  }
  const parsed = CloudConfigResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('Invalid cloud config response');
  }
  return {
    appUrl: parsed.data.appUrl,
    isEnabled: parsed.data.isEnabled,
    isEnterprise: parsed.data.isEnterprise ?? false,
  };
}

/**
 * Returns a function that invalidates the cached Promptfoo Cloud config so
 * the next render fetches fresh data. Call after flows that change local
 * cloud state (login, logout) — the API base URL and signed-in email
 * already invalidate automatically via the query key.
 */
export function useInvalidateCloudConfig(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['cloudConfig'] });
  }, [queryClient]);
}

/**
 * Loads the local Promptfoo Cloud configuration for links and status UI.
 */
export default function useCloudConfig() {
  const queryKey = useCloudConfigQueryKey();
  return useQuery<CloudConfigData, Error>({
    queryKey,
    queryFn: fetchCloudConfig,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
