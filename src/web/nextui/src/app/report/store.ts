import { get, set, del } from 'idb-keyval';
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

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
}

export const useReportStore = create<ReportState>()(
  persist(
    (set) => ({
      showPercentagesOnRiskCards: true,
      setShowPercentagesOnRiskCards: (show: boolean) =>
        set(() => ({ showPercentagesOnRiskCards: show })),
    }),
    {
      name: 'ReportViewStorage',
      storage: createJSONStorage(() => storage),
    },
  ),
);
