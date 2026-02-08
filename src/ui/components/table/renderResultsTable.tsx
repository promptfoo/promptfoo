/**
 * Wrapper function for rendering the Ink results table.
 *
 * This module provides integration between the CLI and the Ink table component,
 * allowing the eval command to display results using the interactive table.
 *
 * IMPORTANT: This module uses dynamic imports for ink to avoid loading
 * ink/React when promptfoo is used as a library.
 */

import { shouldUseInkUI } from '../../interactiveCheck';

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
 * Check if the Ink table should be used.
 * Delegates to the shared opt-in check, with an additional explicit disable option.
 */
export function shouldUseInkTable(): boolean {
  if (process.env.PROMPTFOO_DISABLE_INK_TABLE === 'true') {
    return false;
  }
  return shouldUseInkUI();
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
  const [{ render }, { isRawModeSupported }, { ResultsTable, StaticResultsTable }] =
    await Promise.all([import('ink'), import('../../hooks/useKeypress'), import('./ResultsTable')]);

  const {
    maxRows = 25,
    maxCellLength = 250,
    showIndex = true,
    interactive = isRawModeSupported(),
    onExit,
  } = options;

  return new Promise<void>((resolve) => {
    let instance: ReturnType<typeof render>;

    const handleExit = () => {
      if (instance) {
        instance.unmount();
      }
      onExit?.();
      resolve();
    };

    instance = render(
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
 * Create a results table instance for manual control.
 */
export async function createResultsTableInstance(
  data: EvaluateTable,
  options: RenderResultsTableOptions = {},
) {
  const [{ render }, { isRawModeSupported }, { ResultsTable, StaticResultsTable }] =
    await Promise.all([import('ink'), import('../../hooks/useKeypress'), import('./ResultsTable')]);

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
