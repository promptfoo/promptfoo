import { get, set, del } from 'idb-keyval';
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { persist, createJSONStorage } from 'zustand/middleware';

const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return (await get(name)) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await set(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await del(name);
  },
};

interface ReportState {
  showPercentagesOnRiskCards: boolean;
  setShowPercentagesOnRiskCards: (show: boolean) => void;
  pluginPassRateThreshold: number;
  setPluginPassRateThreshold: (threshold: number) => void;
  showComplianceSection: boolean;
  setShowComplianceSection: (show: boolean) => void;
}

export const useReportStore = create<ReportState>()(
  persist(
    (set) => ({
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: (show: boolean) =>
        set(() => ({ showPercentagesOnRiskCards: show })),
      pluginPassRateThreshold: 1.0,
      setPluginPassRateThreshold: (threshold: number) =>
        set(() => ({ pluginPassRateThreshold: threshold })),
      showComplianceSection: false,
      setShowComplianceSection: (show: boolean) => set(() => ({ showComplianceSection: show })),
    }),
    {
      name: 'ReportViewStorage',
      storage: createJSONStorage(() => storage),
    },
  ),
);
