import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ShareConfigState {
  apiShareBaseUrl: string;
  setApiShareBaseUrl: (apiShareBaseUrl: string) => void;
  appShareBaseUrl: string | undefined;
  setAppShareBaseUrl: (appShareBaseUrl: string) => void;
}

const useShareConfig = create<ShareConfigState>()(
  persist(
    (set) => ({
      apiShareBaseUrl: process.env.NEXT_PUBLIC_PROMPTFOO_SHARE_API_URL || '',
      setApiShareBaseUrl: (apiShareBaseUrl: string) => set({ apiShareBaseUrl }),
      appShareBaseUrl: process.env.NEXT_PUBLIC_PROMPTFOO_APP_SHARE_URL || undefined,
      setAppShareBaseUrl: (appShareBaseUrl: string) => set({ appShareBaseUrl }),
    }),
    {
      name: 'share-config-storage',
    },
  ),
);

export default useShareConfig;

export function useShareAppBaseUrl(): string {
  // If this is running on a server, it should always point to itself.
  const { appShareBaseUrl } = useShareConfig();

  if (appShareBaseUrl) {
    return appShareBaseUrl;
  }

  return `${window.location.protocol}//${window.location.host}`;
}
