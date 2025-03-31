import { create } from 'zustand';

interface UIState {
  isNavbarVisible: boolean;
  setNavbarVisible: (visible: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isNavbarVisible: true,
  setNavbarVisible: (visible: boolean) => set({ isNavbarVisible: visible }),
}));
