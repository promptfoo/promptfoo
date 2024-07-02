import { createContext, useContext, useState, useCallback } from 'react';

// ====================================================
// Types
// ====================================================

type AnchorEl = null | HTMLElement;

type Props = {
  children: React.ReactNode;
};

type ContextState = {
  settingsMenu: {
    display: boolean;
    toggle: (target: HTMLButtonElement) => void;
    anchorEl: AnchorEl;
  };
};

// ====================================================
// Constants
// ====================================================

const DEFAULT_STATE = {
  settingsMenu: {
    display: false,
    toggle: () => {},
    anchorEl: null,
  },
} as ContextState;

// ====================================================
// Context
// ====================================================

const VariablesContext = createContext<ContextState>(DEFAULT_STATE);

VariablesContext.displayName = 'VariablesContext';

export function useVariablesContext() {
  return useContext(VariablesContext);
}

// ====================================================
// Component
// ====================================================

export default function VariablesProvider({ children }: Props) {
  // ====================================================
  // State
  // ====================================================

  const [displaySettingsMenu, setDisplaySettingsMenu] = useState<boolean>(
    DEFAULT_STATE.settingsMenu.display,
  );

  const [settingsMenuAnchorEl, setSettingsMenuAnchorEl] = useState<AnchorEl>(
    DEFAULT_STATE.settingsMenu.anchorEl,
  );

  // ====================================================
  // Event Handlers
  // ====================================================

  /**
   * Toggles the display of the settings menu. If the menu is being opened for the first time,
   * the anchor element is set to the trigger element. This indicates to the menu where in the viewport
   * it should be displayed.
   */
  const toggleSettingsMenu = useCallback(
    (target: HTMLButtonElement) => {
      // Idempotent initialization of the anchor element for the menu
      if (settingsMenuAnchorEl === null) setSettingsMenuAnchorEl(target);

      setDisplaySettingsMenu((prev) => !prev);
    },
    [settingsMenuAnchorEl],
  );

  // ====================================================
  // Render
  // ====================================================

  return (
    <VariablesContext.Provider
      value={{
        settingsMenu: {
          display: displaySettingsMenu,
          toggle: toggleSettingsMenu,
          anchorEl: settingsMenuAnchorEl,
        },
      }}
    >
      {children}
    </VariablesContext.Provider>
  );
}
