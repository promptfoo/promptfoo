/**
 * Main application component for the evaluation UI.
 *
 * This component sets up the provider tree and renders the eval screen.
 */

import React, { useEffect } from 'react';
import { EvalScreen } from './components/eval/EvalScreen';
import { EvalProvider, useEval } from './contexts/EvalContext';
import { UIProvider } from './contexts/UIContext';
import { createEvalUIController, type EvalUIController } from './evalBridge';

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
}: EvalAppProps) {
  const { dispatch, init, start } = useEval();

  // Create and expose the UI controller
  useEffect(() => {
    if (onController) {
      const controller = createEvalUIController(dispatch);
      onController(controller);
    }
  }, [dispatch, onController]);

  // Initialize if initial values provided
  useEffect(() => {
    if (totalTests > 0 || providers.length > 0) {
      init(totalTests, providers);
    }
  }, [totalTests, providers, init]);

  return (
    <EvalScreen
      title={title}
      onComplete={onComplete}
      onExit={onExit}
      showHelp={showHelp}
    />
  );
}

/**
 * Main evaluation application component.
 *
 * This component wraps the evaluation screen with all necessary providers.
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
