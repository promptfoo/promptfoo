/**
 * Wrapper function for rendering the Ink results table.
 *
 * This module provides integration between the CLI and the Ink table component,
 * allowing the eval command to display results using the interactive table.
 */

import { render } from 'ink';
import { isRawModeSupported } from '../../hooks/useKeypress';
import { ResultsTable, StaticResultsTable } from './ResultsTable';

import type { EvaluateTable } from '../../../types';

/**
 * Options for rendering the results table.
 */
export interface RenderResultsTableOptions {
  /** Maximum rows to display (default: 25) */
  maxRows?: number;
  /** Maximum cell content length (default: 250) */
  maxCellLength?: number;
  /** Whether to show row index column (default: true) */
  showIndex?: boolean;
  /** Enable interactive mode (default: auto-detect based on TTY) */
  interactive?: boolean;
  /** Callback when user exits the table */
  onExit?: () => void;
}

/**
 * Check if the Ink table should be used based on environment.
 *
 * Enabled by default when:
 * - stdout is a TTY (interactive terminal)
 * - NOT in a CI environment
 *
 * Can be disabled via PROMPTFOO_DISABLE_INK_TABLE=true
 */
export function shouldUseInkTable(): boolean {
  // Allow explicit disable
  if (process.env.PROMPTFOO_DISABLE_INK_TABLE === 'true') {
    return false;
  }

  // Force enable overrides CI check
  if (process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true') {
    return true;
  }

  // CI environments get non-interactive by default
  if (process.env.CI) {
    return false;
  }

  // Default: use table in TTY environments
  return process.stdout.isTTY === true;
}

/**
 * Render the results table using Ink.
 *
 * Returns a promise that resolves when the user exits the table (interactive mode)
 * or immediately after rendering (non-interactive mode).
 *
 * @example
 * ```typescript
 * const table = await evalRecord.getTable();
 * await renderResultsTable(table, {
 *   maxRows: 25,
 *   onExit: () => console.log('Table closed'),
 * });
 * ```
 */
export async function renderResultsTable(
  data: EvaluateTable,
  options: RenderResultsTableOptions = {},
): Promise<void> {
  const {
    maxRows = 25,
    maxCellLength = 250,
    showIndex = true,
    interactive = isRawModeSupported(),
    onExit,
  } = options;

  return new Promise<void>((resolve) => {
    const handleExit = () => {
      instance.unmount();
      onExit?.();
      resolve();
    };

    const instance = render(
      interactive ? (
        <ResultsTable
          data={data}
          maxRows={maxRows}
          maxCellLength={maxCellLength}
          showIndex={showIndex}
          interactive={true}
          onExit={handleExit}
        />
      ) : (
        <StaticResultsTable data={data} maxRows={maxRows} maxCellLength={maxCellLength} />
      ),
      {
        exitOnCtrlC: false,
      },
    );

    // For non-interactive mode, resolve immediately after rendering
    if (!interactive) {
      // Give Ink time to render
      setTimeout(() => {
        instance.unmount();
        resolve();
      }, 100);
    }
  });
}

/**
 * Synchronous version that returns the Ink instance for manual control.
 */
export function createResultsTableInstance(
  data: EvaluateTable,
  options: RenderResultsTableOptions = {},
) {
  const {
    maxRows = 25,
    maxCellLength = 250,
    showIndex = true,
    interactive = isRawModeSupported(),
    onExit,
  } = options;

  return render(
    interactive ? (
      <ResultsTable
        data={data}
        maxRows={maxRows}
        maxCellLength={maxCellLength}
        showIndex={showIndex}
        interactive={true}
        onExit={onExit}
      />
    ) : (
      <StaticResultsTable data={data} maxRows={maxRows} maxCellLength={maxCellLength} />
    ),
    {
      exitOnCtrlC: false,
    },
  );
}
