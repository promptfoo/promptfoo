/**
 * UIContext - Terminal and display state management.
 *
 * This context provides information about the terminal environment
 * and user interface preferences.
 */

import { useStdout } from 'ink';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface UIState {
  // Terminal dimensions
  columns: number;
  rows: number;

  // Display preferences
  colorMode: 'auto' | 'always' | 'never';
  compactMode: boolean;

  // Focus state
  isFocused: boolean;
}

interface UIContextValue {
  state: UIState;
  setColorMode: (mode: UIState['colorMode']) => void;
  setCompactMode: (compact: boolean) => void;
  toggleCompactMode: () => void;
  supportsColor: boolean;
  isNarrow: boolean; // < 80 columns
  isShort: boolean; // < 24 rows
}

const UIContext = createContext<UIContextValue | null>(null);

export interface UIProviderProps {
  children: React.ReactNode;
  colorMode?: UIState['colorMode'];
  compactMode?: boolean;
}

export function UIProvider({
  children,
  colorMode: initialColorMode = 'auto',
  compactMode: initialCompactMode = false,
}: UIProviderProps) {
  const { stdout } = useStdout();

  const [state, setState] = useState<UIState>({
    columns: stdout?.columns || 80,
    rows: stdout?.rows || 24,
    colorMode: initialColorMode,
    compactMode: initialCompactMode,
    isFocused: true,
  });

  // Update dimensions on resize
  useEffect(() => {
    const handleResize = () => {
      setState((prev) => ({
        ...prev,
        columns: stdout?.columns || 80,
        rows: stdout?.rows || 24,
      }));
    };

    stdout?.on?.('resize', handleResize);
    return () => {
      stdout?.off?.('resize', handleResize);
    };
  }, [stdout]);

  // Actions
  const setColorMode = useCallback((mode: UIState['colorMode']) => {
    setState((prev) => ({ ...prev, colorMode: mode }));
  }, []);

  const setCompactMode = useCallback((compact: boolean) => {
    setState((prev) => ({ ...prev, compactMode: compact }));
  }, []);

  const toggleCompactMode = useCallback(() => {
    setState((prev) => ({ ...prev, compactMode: !prev.compactMode }));
  }, []);

  // Computed values
  const supportsColor = useMemo(() => {
    if (state.colorMode === 'always') {
      return true;
    }
    if (state.colorMode === 'never') {
      return false;
    }
    // Auto mode: check environment
    if (process.env.NO_COLOR) {
      return false;
    }
    if (process.env.FORCE_COLOR) {
      return true;
    }
    return stdout?.isTTY === true;
  }, [state.colorMode, stdout?.isTTY]);

  const isNarrow = state.columns < 80;
  const isShort = state.rows < 24;

  const value: UIContextValue = {
    state,
    setColorMode,
    setCompactMode,
    toggleCompactMode,
    supportsColor,
    isNarrow,
    isShort,
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

// Convenience hooks
export function useTerminalSize() {
  const { state } = useUI();
  return { columns: state.columns, rows: state.rows };
}

export function useCompactMode() {
  const { state, setCompactMode, toggleCompactMode } = useUI();
  return {
    isCompact: state.compactMode,
    setCompactMode,
    toggleCompactMode,
  };
}
