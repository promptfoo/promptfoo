import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ScanPath {
  path: string;
  type: 'file' | 'directory';
  name: string;
}

interface RecentScan {
  id: string;
  paths: ScanPath[];
  timestamp: number;
  label?: string;
}

interface ModelAuditStore {
  recentScans: RecentScan[];
  addRecentScan: (paths: ScanPath[], label?: string) => void;
  removeRecentScan: (id: string) => void;
  clearRecentScans: () => void;
  getRecentScans: () => RecentScan[];
}

const MAX_RECENT_SCANS = 10;

export const useModelAuditStore = create<ModelAuditStore>()(
  persist(
    (set, get) => ({
      recentScans: [],
      addRecentScan: (paths, label) => {
        const newScan: RecentScan = {
          id: Date.now().toString(),
          paths,
          timestamp: Date.now(),
          label,
        };
        set((state) => ({
          recentScans: [newScan, ...state.recentScans].slice(0, MAX_RECENT_SCANS),
        }));
      },
      removeRecentScan: (id) => {
        set((state) => ({
          recentScans: state.recentScans.filter((scan) => scan.id !== id),
        }));
      },
      clearRecentScans: () => {
        set({ recentScans: [] });
      },
      getRecentScans: () => get().recentScans,
    }),
    {
      name: 'model-audit-store',
      skipHydration: true,
    },
  ),
);
