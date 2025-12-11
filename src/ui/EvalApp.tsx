/**
 * Main application component for the evaluation UI.
 *
 * This component sets up the provider tree and renders both the eval screen
 * and results table. When in results phase, both are visible with the eval
 * summary box above the interactive results table.
 */

import { Box, useApp } from 'ink';
import { useEffect, useRef } from 'react';
import { EvalScreen } from './components/eval/EvalScreen';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { ResultsTable } from './components/table/ResultsTable';
import { EvalProvider, useEval } from './contexts/EvalContext';
import { UIProvider } from './contexts/UIContext';
import { createEvalUIController, type EvalUIController } from './evalBridge';

export interface ShareContext {
  /** Organization name (from cloud config) */
  organizationName: string;
  /** Team name if applicable */
  teamName?: string;
}

export interface EvalAppProps {
  /** Title for the evaluation */
  title?: string;
  /** Callback when evaluation completes */
  onComplete?: () => void;
  /** Callback when user cancels during evaluation (NOT called on normal exit after completion) */
  onCancel?: () => void;
  /** Callback when user requests exit (always called on exit, regardless of completion state) */
  onExit?: () => void;
  /** Callback to receive the UI controller for external updates */
  onController?: (controller: EvalUIController) => void;
  /** Initial total test count (can be updated via controller) */
  totalTests?: number;
  /** Initial provider list (can be updated via controller) */
  providers?: string[];
  /** Whether to show keyboard shortcuts help */
  showHelp?: boolean;
  /** Share context (org/team) if sharing is enabled */
  shareContext?: ShareContext | null;
}

/**
 * Inner component that has access to the EvalContext.
 */
function EvalAppInner({
  title,
  onComplete,
  onCancel,
  onExit,
  onController,
  totalTests = 0,
  providers = [],
  showHelp,
  shareContext,
}: EvalAppProps) {
  const { exit } = useApp();
  const { dispatch, init, state, isComplete } = useEval();
  const controllerRef = useRef<EvalUIController | null>(null);

  // Create and expose the UI controller
  useEffect(() => {
    if (onController && !controllerRef.current) {
      const controller = createEvalUIController(dispatch);
      controllerRef.current = controller;
      onController(controller);
    }
  }, [dispatch, onController]);

  // Initialize if initial values provided
  useEffect(() => {
    if (totalTests > 0 || providers.length > 0) {
      init(totalTests, providers);
    }
  }, [totalTests, providers, init]);

  // Handle exit during evaluation (cancellation)
  const handleEvalExit = () => {
    // Only call onCancel if evaluation is not complete
    if (!isComplete) {
      onCancel?.();
    }
    onExit?.();
    exit();
  };

  // Handle exit from results table (normal exit after completion)
  const handleResultsExit = () => {
    // Don't call onCancel - evaluation completed successfully
    onExit?.();
    exit();
  };

  // Check if we're in results phase
  const inResultsPhase = state.sessionPhase === 'results' && state.tableData;

  // Render both EvalScreen and ResultsTable (when in results phase)
  // EvalScreen shows the summary box, ResultsTable shows detailed results below
  return (
    <Box flexDirection="column">
      {/* Eval screen - always visible, shows summary when complete */}
      <EvalScreen
        title={title}
        onComplete={onComplete}
        onExit={inResultsPhase ? undefined : handleEvalExit} // Only handle exit in eval phase
        showHelp={!inResultsPhase && showHelp} // Hide help bar when showing results table
        shareContext={shareContext}
      />

      {/* Results table - shown when in results phase */}
      {inResultsPhase && (
        <ResultsTable
          data={state.tableData!}
          maxRows={25}
          maxCellLength={250}
          showIndex={true}
          interactive={true}
          onExit={handleResultsExit}
        />
      )}
    </Box>
  );
}

/**
 * Main evaluation application component.
 *
 * This component wraps the evaluation screen with all necessary providers.
 * It manages the unified session that transitions from eval progress to results table,
 * maintaining a persistent sharing status header across both phases.
 *
 * @example
 * ```tsx
 * // In your eval command:
 * let controller: EvalUIController;
 *
 * await renderInteractive(
 *   <EvalApp
 *     title="My Evaluation"
 *     onController={(c) => { controller = c; }}
 *     onComplete={() => console.log('Done!')}
 *   />
 * );
 *
 * // Then use controller to update state:
 * controller.init(100, ['openai:gpt-4', 'anthropic:claude-3']);
 * controller.start();
 * // ... progress updates happen via progressCallback
 * controller.complete({ passed: 90, failed: 10, errors: 0 });
 *
 * // Transition to results table:
 * const table = await evalRecord.getTable();
 * controller.showResults(table);
 * ```
 */
export function EvalApp(props: EvalAppProps) {
  return (
    <UIProvider>
      <EvalProvider>
        <ErrorBoundary componentName="EvalApp">
          <EvalAppInner {...props} />
        </ErrorBoundary>
      </EvalProvider>
    </UIProvider>
  );
}

export default EvalApp;
