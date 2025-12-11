/**
 * Main application component for the evaluation UI.
 *
 * This component sets up the provider tree and renders the eval screen or results table.
 * The sharing status header persists across both phases.
 */

import { Box, Text, useApp } from 'ink';
import { useEffect, useRef } from 'react';
import { EvalScreen } from './components/eval/EvalScreen';
import { ResultsTable } from './components/table/ResultsTable';
import { Spinner } from './components/shared/Spinner';
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
  /** Callback when user requests exit */
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
 * Sharing status header component - persists across eval and results phases.
 */
function SharingStatusHeader({ shareContext }: { shareContext?: ShareContext | null }) {
  const { state } = useEval();

  if (!shareContext) {
    return null;
  }

  return (
    <Box>
      {state.sharingStatus === 'completed' && state.shareUrl ? (
        <>
          <Text color="green">✔ Shared: </Text>
          <Text color="cyan">{state.shareUrl}</Text>
        </>
      ) : state.sharingStatus === 'failed' ? (
        <Text color="red">✗ Share failed</Text>
      ) : (
        <>
          <Text dimColor>Sharing to: </Text>
          <Text color="cyan">{shareContext.organizationName}</Text>
          {shareContext.teamName && (
            <>
              <Text dimColor> {'>'} </Text>
              <Text color="cyan">{shareContext.teamName}</Text>
            </>
          )}
          {state.sharingStatus === 'sharing' && (
            <>
              <Text dimColor> </Text>
              <Spinner type="dots" color="cyan" />
            </>
          )}
        </>
      )}
    </Box>
  );
}

/**
 * Inner component that has access to the EvalContext.
 */
function EvalAppInner({
  title,
  onComplete,
  onExit,
  onController,
  totalTests = 0,
  providers = [],
  showHelp,
  shareContext,
}: EvalAppProps) {
  const { exit } = useApp();
  const { dispatch, init, state } = useEval();
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

  // Handle exit from results table
  const handleResultsExit = () => {
    onExit?.();
    exit();
  };

  // Render based on session phase
  if (state.sessionPhase === 'results' && state.tableData) {
    return (
      <Box flexDirection="column">
        {/* Persistent sharing status header */}
        <SharingStatusHeader shareContext={shareContext} />

        {/* Results table */}
        <ResultsTable
          data={state.tableData}
          maxRows={25}
          maxCellLength={250}
          showIndex={true}
          interactive={true}
          onExit={handleResultsExit}
        />
      </Box>
    );
  }

  // Eval phase - render EvalScreen
  return (
    <EvalScreen
      title={title}
      onComplete={onComplete}
      onExit={onExit}
      showHelp={showHelp}
      shareContext={shareContext}
    />
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
        <EvalAppInner {...props} />
      </EvalProvider>
    </UIProvider>
  );
}

export default EvalApp;
