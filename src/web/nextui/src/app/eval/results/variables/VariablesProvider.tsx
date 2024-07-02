import { createContext, useContext, useState, useCallback } from 'react';
import type { EvaluateTable } from '@/app/eval/types';

// ====================================================
// Types
// ====================================================

type AnchorEl = null | HTMLElement;

type VariableColumn = {
  visible: boolean;
  label: string;
};

type Props = {
  children: React.ReactNode;
  vars: EvaluateTable['head']['vars'];
};

type ContextState = {
  settingsMenu: {
    display: boolean;
    toggle: (target: HTMLButtonElement) => void;
    anchorEl: AnchorEl;
  };
  variableColumns: VariableColumn[];
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
  variableColumns: [],
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

export default function VariablesProvider({ children, vars }: Props) {
  // ====================================================
  // State
  // ====================================================

  const [variableColumns, setVariableColumns] = useState<VariableColumn[]>(
    vars.map((variable) => ({
      visible: true,
      label: variable,
    })),
  );

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
        variableColumns,
      }}
    >
      {children}
    </VariablesContext.Provider>
  );
}
