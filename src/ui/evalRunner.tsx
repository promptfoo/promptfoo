/**
 * Evaluation runner with Ink UI integration.
 *
 * This module provides a function to run evaluations with the interactive Ink UI.
 * It handles the lifecycle of rendering, progress updates, and cleanup.
 */

import React from 'react';
import logger from '../logger';
import type { EvaluateOptions, PromptMetrics, RunEvalOptions, TestSuite } from '../types/index';
import type Eval from '../models/eval';
import { EvalApp } from './EvalApp';
import { extractProviderIds, type EvalUIController } from './evalBridge';
import { renderInteractive, shouldUseInteractiveUI, type RenderResult } from './render';

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
  const { title, showHelp = true, evaluateOptions, testSuite, onCancel } = options;

  // Extract provider IDs for UI
  const providerIds = extractProviderIds(
    testSuite.providers.map((p) => ({
      id: () => (typeof p === 'string' ? p : p.id?.() || 'unknown'),
      label: typeof p === 'string' ? undefined : p.label,
    })),
  );

  // Track the controller when it's ready
  let controller: EvalUIController | null = null;
  let resolveController: (controller: EvalUIController) => void;
  const controllerPromise = new Promise<EvalUIController>((resolve) => {
    resolveController = resolve;
  });

  // Track completion
  let resolveComplete: () => void;
  const completePromise = new Promise<void>((resolve) => {
    resolveComplete = resolve;
  });

  // Render the app
  const renderResult = await renderInteractive(
    <EvalApp
      title={title}
      showHelp={showHelp}
      onController={(c) => {
        controller = c;
        resolveController!(c);
      }}
      onComplete={() => {
        resolveComplete!();
      }}
      onExit={() => {
        onCancel?.();
      }}
    />,
    {
      exitOnCtrlC: false,
      patchConsole: true,
    },
  );

  // Wait for controller to be available
  controller = await controllerPromise;

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
        originalCallback(completed, total, index, evalStep as RunEvalOptions, metrics as PromptMetrics);
      }
    },
  };

  // Cleanup function
  const cleanup = () => {
    renderResult.cleanup();
  };

  return {
    renderResult,
    controller: controller!,
    evaluateOptions: modifiedOptions,
    cleanup,
  };
}

/**
 * Check if the Ink UI should be used for this evaluation.
 *
 * The Ink UI is used when:
 * - PROMPTFOO_INTERACTIVE_UI is set to true (opt-in for now)
 * - AND one of:
 *   - stdout is a TTY
 *   - PROMPTFOO_FORCE_INTERACTIVE_UI is set (allows non-TTY usage)
 */
export function shouldUseInkUI(): boolean {
  // For now, make it opt-in via environment variable
  const explicitEnable = process.env.PROMPTFOO_INTERACTIVE_UI === 'true';
  const forceEnable = process.env.PROMPTFOO_FORCE_INTERACTIVE_UI === 'true';

  if (!explicitEnable) {
    logger.debug('Ink UI not enabled (set PROMPTFOO_INTERACTIVE_UI=true to enable)');
    return false;
  }

  // If force is set, skip TTY checks
  if (forceEnable) {
    logger.debug('Ink UI force-enabled via PROMPTFOO_FORCE_INTERACTIVE_UI');
    return true;
  }

  return shouldUseInteractiveUI();
}
