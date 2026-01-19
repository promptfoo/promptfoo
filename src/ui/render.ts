/**
 * Core rendering utilities for the Ink-based CLI UI.
 *
 * This module provides utilities for rendering interactive React components
 * in the terminal, with proper TTY detection and cleanup handling.
 */

import type { ComponentType, ReactElement } from 'react';

import { canUseInteractiveUI } from './interactiveCheck';
import type { Instance } from 'ink';

/**
 * Process exit codes for signal handling.
 */
const EXIT_CODES = {
  /** Exit code for SIGINT (Ctrl+C) - 128 + 2 */
  SIGINT: 130,
  /** Exit code for SIGTERM - 128 + 15 */
  SIGTERM: 143,
} as const;

// Lazy load Ink to avoid loading React in non-interactive mode
let inkModule: typeof import('ink') | null = null;

async function getInk(): Promise<typeof import('ink')> {
  if (!inkModule) {
    inkModule = await import('ink');
  }
  return inkModule;
}

/**
 * Options for rendering an interactive Ink component
 */
export interface RenderOptions {
  /** Exit on Ctrl+C - defaults to false for manual handling */
  exitOnCtrlC?: boolean;
  /** Patch console to prevent raw output - defaults to true */
  patchConsole?: boolean;
  /** Debug mode - shows render times */
  debug?: boolean;
  /** Callback invoked on SIGINT/SIGTERM before exit - use for cleanup/abort logic */
  onSignal?: (signal: 'SIGINT' | 'SIGTERM') => void;
}

/**
 * Result of rendering an Ink component
 */
export interface RenderResult {
  /** The Ink instance for controlling the render */
  instance: Instance;
  /** Wait for the component to unmount */
  waitUntilExit: () => Promise<void>;
  /** Cleanup function to call when done */
  cleanup: () => void;
  /** Rerender with updated props */
  rerender: (node: ReactElement) => void;
  /** Clear the rendered output */
  clear: () => void;
  /** Unmount the component */
  unmount: () => void;
}

// Re-export detection utilities
export { canUseInteractiveUI } from './interactiveCheck';

/**
 * Render an Ink component in the terminal.
 *
 * This is the main entry point for rendering interactive UI components.
 * It handles TTY detection, cleanup, and error handling.
 *
 * @param element - The React element to render
 * @param options - Render options
 * @returns A render result with control methods
 */
export async function renderInteractive(
  element: ReactElement,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const { exitOnCtrlC = false, patchConsole = true, debug = false, onSignal } = options;

  // Verify we're in a TTY environment
  if (!canUseInteractiveUI()) {
    throw new Error(
      'Cannot render interactive UI: stdout is not a TTY. ' +
        'Interactive UI requires a terminal. Use non-interactive fallback instead.',
    );
  }

  const ink = await getInk();

  const instance = ink.render(element, {
    exitOnCtrlC,
    patchConsole,
    debug,
  });

  // Set up cleanup handlers
  let isCleanedUp = false;

  // Signal handlers with proper exit codes and cleanup
  // Exit codes: 130 = 128 + SIGINT(2), 143 = 128 + SIGTERM(15)
  // Uses process.exitCode instead of process.exit() to allow async cleanup
  const handleSigint = () => {
    if (!isCleanedUp) {
      isCleanedUp = true;
      instance.unmount();
    }
    // Invoke callback for abort/cancel logic
    onSignal?.('SIGINT');
    // Set exit code and schedule graceful shutdown
    // This allows pending async operations to complete
    process.exitCode = EXIT_CODES.SIGINT;
    setImmediate(() => {
      process.exit();
    });
  };

  const handleSigterm = () => {
    if (!isCleanedUp) {
      isCleanedUp = true;
      instance.unmount();
    }
    // Invoke callback for abort/cancel logic
    onSignal?.('SIGTERM');
    // Set exit code and schedule graceful shutdown
    process.exitCode = EXIT_CODES.SIGTERM;
    setImmediate(() => {
      process.exit();
    });
  };

  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  const cleanup = () => {
    if (isCleanedUp) {
      return;
    }
    isCleanedUp = true;

    // Remove signal handlers to prevent memory leaks and double-handling
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);

    instance.unmount();
  };

  return {
    instance,
    waitUntilExit: () => instance.waitUntilExit(),
    cleanup,
    rerender: (node: ReactElement) => instance.rerender(node),
    clear: () => instance.clear(),
    unmount: () => instance.unmount(),
  };
}

/**
 * Higher-order function to run an Ink component and wait for it to exit.
 *
 * This is a convenience wrapper that handles the full lifecycle:
 * 1. Renders the component
 * 2. Waits for it to unmount
 * 3. Cleans up
 *
 * @param Component - The React component to render
 * @param props - Props to pass to the component
 * @param options - Render options
 */
export async function runInteractive<P extends object>(
  Component: ComponentType<P>,
  props: P,
  options: RenderOptions = {},
): Promise<void> {
  const { createElement } = await import('react');
  const element = createElement(Component, props);
  const { waitUntilExit, cleanup } = await renderInteractive(element, options);

  try {
    await waitUntilExit();
  } finally {
    cleanup();
  }
}

/**
 * Get terminal dimensions with sensible defaults.
 */
export function getTerminalSize(): { columns: number; rows: number } {
  return {
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

/**
 * Check if the terminal supports colors.
 */
export function supportsColor(): boolean {
  // Check for explicit disable
  if (process.env.NO_COLOR) {
    return false;
  }

  // Check for explicit enable
  if (process.env.FORCE_COLOR) {
    return true;
  }

  // Check if stdout supports colors
  return process.stdout.isTTY && process.stdout.hasColors?.() !== false;
}
