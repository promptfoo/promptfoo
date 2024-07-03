import { createContext, useContext, useState } from 'react';
import type { EvaluateTable } from '@/app/eval/types';
import { useLocalStorage } from 'usehooks-ts';

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
  evalId: string;
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

export function useVariablesSettingsContext() {
  return useContext(VariablesContext);
}

// ====================================================
// Component
// ====================================================

export default function VariablesSettingsProvider({ children, vars, evalId }: Props) {
  // ====================================================
  // State
  // ====================================================

  // Visibility state is persisted to local storage to keep the user's preferences between
  // page reloads.
  //! Note: this should be more tightly coupled with the table initialization to ensure that
  //! the table's initial state is consistent with the user's preferences. Currently, the table
  //! is initialized with all columns visible, and then the visibility is updated based on the
  //! user's preferences.
  const [variableColumns, setVariableColumns] = useLocalStorage<VariableColumn[]>(
    `variable-settings_${evalId}_columns`,
    // By default all columns are visible
    vars.map((variable) => ({
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
