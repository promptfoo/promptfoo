import { createContext, useContext, useState } from 'react';
import type { EvaluateTable } from '@/app/eval/types';

// ====================================================
// Types
// ====================================================

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
    toggle: () => void;
  };
  variableColumns: VariableColumn[];
  toggleColumnVisibility: (index: number) => void;
};

// ====================================================
// Constants
// ====================================================

const DEFAULT_STATE = {
  settingsMenu: {
    display: false,
    toggle: () => {},
  },
  variableColumns: [],
  toggleColumnVisibility: () => {},
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
      // By default all columns are visible
      // TODO: Use local storage to persist user preferences on a per-evaluation basis
      visible: true,
      label: variable,
    })),
  );

  const [displaySettingsMenu, setDisplaySettingsMenu] = useState<boolean>(
    DEFAULT_STATE.settingsMenu.display,
  );

  // ====================================================
  // Event Handlers
  // ====================================================

  /**
   * Toggles the display of the settings menu.
   */
  function toggleSettingsMenu() {
    setDisplaySettingsMenu((prev) => !prev);
  }

  function toggleColumnVisibility(index: number) {
    setVariableColumns((prev) => {
      const updatedColumns = [...prev];
      updatedColumns[index] = {
        ...prev[index],
        visible: !prev[index].visible,
      };

      return updatedColumns;
    });
  }

  // ====================================================
  // Render
  // ====================================================

  return (
    <VariablesContext.Provider
      value={{
        settingsMenu: {
          display: displaySettingsMenu,
          toggle: toggleSettingsMenu,
        },
        variableColumns,
        toggleColumnVisibility,
      }}
    >
      {children}
    </VariablesContext.Provider>
  );
}
