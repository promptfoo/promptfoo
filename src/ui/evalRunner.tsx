/**
 * Evaluation runner with Ink UI integration.
 *
 * This module provides a function to run evaluations with the interactive Ink UI.
 * It handles the lifecycle of rendering, progress updates, and cleanup.
 *
 * IMPORTANT: This module uses dynamic imports for ink-related components to avoid
 * loading ink/React when promptfoo is used as a library.
 */

import logger from '../logger';

import type { EvaluateOptions, PromptMetrics, RunEvalOptions, TestSuite } from '../types/index';
import type { EvalUIController } from './evalBridge';
import type { RenderResult } from './render';
import type { ShareContext } from './types';
import type { InkUITransport } from './utils/InkUITransport';

export interface EvalRunnerOptions {
  /** Title for the evaluation UI */
  title?: string;
  /** Whether to show the keyboard help */
  showHelp?: boolean;
  /** Original evaluate options */
  evaluateOptions: EvaluateOptions;
  /** Test suite being evaluated */
  testSuite: TestSuite;
  /** Callback for when user cancels via UI */
  onCancel?: () => void;
  /** Share context (org/team) if sharing is enabled */
  shareContext?: ShareContext | null;
}

export interface InkEvalResult {
  /** The Ink render result (for cleanup) */
  renderResult: RenderResult;
  /** The UI controller for sending updates */
  controller: EvalUIController;
  /** Modified evaluate options with Ink progress callback */
  evaluateOptions: EvaluateOptions;
  /** Cleanup function */
  cleanup: () => void;
}

/**
 * Initialize the Ink UI for an evaluation run.
 *
 * This sets up the Ink rendering and returns a controller that can be used
 * to send progress updates during the evaluation.
 *
 * @param options - Configuration options
 * @returns Object with controller, modified options, and cleanup function
 *
 * @example
 * ```typescript
 * const { controller, evaluateOptions, cleanup } = await initInkEval({
 *   title: 'My Eval',
 *   evaluateOptions: { ... },
 *   testSuite,
 * });
 *
 * try {
 *   // Initialize UI state
 *   controller.init(testSuite.tests.length, providerIds);
 *   controller.start();
 *
 *   // Run evaluation (progress updates happen via evaluateOptions.progressCallback)
 *   const result = await evaluate(testSuite, evalRecord, evaluateOptions);
 *
 *   // Mark complete
 *   controller.complete({ passed, failed, errors });
 * } finally {
 *   cleanup();
 * }
 * ```
 */
export async function initInkEval(options: EvalRunnerOptions): Promise<InkEvalResult> {
  const { title, showHelp = true, evaluateOptions, testSuite, onCancel, shareContext } = options;

  // Dynamic imports to avoid loading ink/React when used as library
  const [{ EvalApp }, { extractProviderIds }, { renderInteractive }] = await Promise.all([
    import('./EvalApp'),
    import('./evalBridge'),
    import('./render'),
  ]);

  // Extract provider IDs for UI
  const _providerIds = extractProviderIds(
    testSuite.providers.map((p) => ({
      id: () => (typeof p === 'string' ? p : p.id?.() || 'unknown'),
      label: typeof p === 'string' ? undefined : p.label,
    })),
  );

  // Track the controller when it's ready
  let controller: EvalUIController | null = null;
  let resolveController: (controller: EvalUIController) => void;
  let rejectController: (error: Error) => void;
  const controllerPromise = Promise.race([
    new Promise<EvalUIController>((resolve, reject) => {
      resolveController = resolve;
      rejectController = reject;
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Ink UI failed to initialize within 10 seconds')), 10_000),
    ),
  ]);

  // Render the app
  const renderResult = await renderInteractive(
    <EvalApp
      title={title}
      showHelp={showHelp}
      shareContext={shareContext}
      onController={(c) => {
        controller = c;
        resolveController!(c);
      }}
      onCancel={() => {
        // Called when user exits DURING evaluation (actual cancellation)
        onCancel?.();
      }}
    />,
    {
      exitOnCtrlC: false,
      patchConsole: true,
      // Route SIGINT/SIGTERM through the cancel path for proper cleanup
      onSignal: (signal) => {
        logger.debug(`Received ${signal} signal - triggering cancellation`);
        // Reject controller promise if signal fires before React tree mounts
        rejectController?.(new Error(`Received ${signal} signal before UI initialized`));
        onCancel?.();
      },
    },
  );

  // Wait for controller to be available
  try {
    controller = await controllerPromise;
  } catch (error) {
    // Controller initialization failed (timeout or signal)
    logger.error('Failed to initialize Ink UI controller', { error });
    renderResult.cleanup();
    throw error;
  }

  // Early exit if controller is not available
  if (!controller) {
    renderResult.cleanup();
    throw new Error('Controller initialization failed');
  }

  // Register logger transport to capture logs in the UI
  // The transport calls controller.addLog for each log entry
  let inkTransport: InkUITransport | null = null;
  let unregisterTransport: ((logger: typeof import('../logger').default) => void) | null = null;
  try {
    const { registerInkUITransport, unregisterInkUITransport } = await import(
      './utils/InkUITransport'
    );
    unregisterTransport = unregisterInkUITransport;
    inkTransport = registerInkUITransport(
      logger,
      (entry) => {
        controller?.addLog(entry);
      },
      'warn', // Default to warn level - verbose mode will change this to debug
    );
  } catch (err) {
    // Log transport registration failure but continue without it
    logger.debug('Failed to register InkUI log transport', { error: err });
  }

  // Create modified evaluate options with Ink progress callback
  const originalCallback = evaluateOptions.progressCallback;
  const modifiedOptions: EvaluateOptions = {
    ...evaluateOptions,
    showProgressBar: false, // Disable cli-progress bar
    progressCallback: (
      completed: number,
      total: number,
      index: number,
      evalStep?: RunEvalOptions,
      metrics?: PromptMetrics,
    ) => {
      // Update Ink UI
      if (controller) {
        controller.progress(completed, total, index, evalStep, metrics);
      }

      // Also call original callback if present
      // Note: The evaluator may pass undefined for evalStep during comparison steps
      if (originalCallback) {
        originalCallback(
          completed,
          total,
          index,
          evalStep as RunEvalOptions,
          metrics as PromptMetrics,
        );
      }
    },
  };

  // Cleanup function
  const cleanup = () => {
    // Unregister the logger transport first
    if (inkTransport && unregisterTransport) {
      try {
        unregisterTransport(logger);
      } catch {
        // Ignore cleanup errors
      }
    }
    renderResult.cleanup();
  };

  return {
    renderResult,
    controller: controller!,
    evaluateOptions: modifiedOptions,
    cleanup,
  };
}
