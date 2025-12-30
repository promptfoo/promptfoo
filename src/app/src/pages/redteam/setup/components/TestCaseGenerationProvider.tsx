import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import {
  DEFAULT_MULTI_TURN_MAX_TURNS,
  isMultiTurnStrategy,
  type Plugin,
  type Strategy,
} from '@promptfoo/redteam/constants';
import { type Config } from '../types';
import { TestCaseDialog } from './TestCaseDialog';
import type { ConversationMessage } from '@promptfoo/redteam/types';

import type {
  GeneratedTestCase,
  TargetPlugin,
  TargetResponse,
  TargetStrategy,
} from './testCaseGenerationTypes';

// Re-export types for backward compatibility
export type { GeneratedTestCase, TargetResponse, TargetPlugin, TargetStrategy };

const DEFAULT_PLUGIN = 'harmful:hate';

const TEST_GENERATION_TIMEOUT = 60000; // 60s timeout
const TEST_EXECUTION_TIMEOUT = 60000; // 60s timeout
const ERROR_MSG_DURATION = 7500; // 7.5s duration

// Batch generation constants
const BATCH_SIZE = 5; // Number of test cases to generate per batch
const PREFETCH_THRESHOLD = 2; // Prefetch next batch when N remaining

type OnGenerationSuccess = (testCase: GeneratedTestCase) => void;
type OnGenerationError = (error: Error) => void;

// ===================================================================
// Context
// ===================================================================

interface TestGenerationContext {
  // State
  isGenerating: boolean;
  plugin: Plugin | null;
  strategy: Strategy | null;
  // Methods
  generateTestCase: (
    plugin: TargetPlugin,
    strategy: TargetStrategy,
    onSuccess?: OnGenerationSuccess,
    onError?: OnGenerationError,
  ) => Promise<void>;
  continueGeneration: (additionalTurns: number) => void;
}

const TestCaseGenerationContext = createContext<TestGenerationContext>({
  isGenerating: false,
  plugin: null,
  strategy: null,
  generateTestCase: async () => {},
  continueGeneration: () => {},
});

// ===================================================================
// Helper Functions
// ===================================================================

function getHistory(
  generatedTestCases: GeneratedTestCase[],
  targetResponses: TargetResponse[],
): ConversationMessage[] {
  const history: ConversationMessage[] = [];
  for (let i = 0; i < targetResponses.length; i++) {
    const testCase = generatedTestCases[i];
    const response = targetResponses[i];
    if (testCase) {
      history.push({ role: 'user', content: testCase.prompt });
      if (response?.output) {
        history.push({ role: 'assistant', content: response.output });
      }
    }
  }
  return history;
}

/**
 * POSTS to the `/redteam/generate-test` endpoint to generate test case(s) for the given plugin and strategy.
 * @param count - Number of test cases to generate (1-10, default 1). Ignored for multi-turn strategies.
 */
async function callTestGenerationApi(
  plugin: TargetPlugin,
  strategy: TargetStrategy,
  purpose: string | null = null,
  abortController: AbortController,
  history: ConversationMessage[] = [],
  turn: number = 0,
  maxTurns: number = 1,
  count: number = 1,
) {
  return callApi('/redteam/generate-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
    body: JSON.stringify({
      plugin,
      strategy,
      config: { applicationDefinition: { purpose } },
      history,
      turn,
      maxTurns,
      count,
    }),
    signal: AbortSignal.any([AbortSignal.timeout(TEST_GENERATION_TIMEOUT), abortController.signal]),
  });
}

/**
 * POSTS to the `/providers/test` endpoint to send a given prompt to a target for evaluation.
 */
async function callTestExecutionApi(
  target: Config['target'],
  prompt: GeneratedTestCase['prompt'],
  abortController: AbortController,
) {
  return callApi('/providers/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      providerOptions: target,
      prompt,
    }),
    signal: AbortSignal.any([AbortSignal.timeout(TEST_EXECUTION_TIMEOUT), abortController.signal]),
  });
}

// ===================================================================
// Provider
// ===================================================================

/**
 * Orchestrates test case generation and target test execution. Generation and execution are run in
 * separate effects to allow for independent view updates at each stage.
 *
 * TODO: Simplify this to:
 *
 * - Use the same state for single and multi-turn generation (arrays)
 * - Use the same functions (use a `turn` argument)
 * - Use `useState` instead of `useRef` for storing values
 * - See https://github.com/promptfoo/promptfoo/blob/01fb999fb799c33564323a78262233607da051d8/src/app/src/pages/redteam/setup/components/TestCaseGenerationProvider.tsx
 *    for state of thi file prior to adding multi-turn support.
 */
export const TestCaseGenerationProvider: React.FC<{
  children: React.ReactNode;
  redTeamConfig: Config;
  allowPluginChange?: boolean;
}> = ({ children, redTeamConfig, allowPluginChange = false }) => {
  // ===================================================================
  // General Hooks
  // ===================================================================

  const { recordEvent } = useTelemetry();
  const toast = useToast();

  // ===================================================================
  // State
  // ===================================================================

  // How many turns should the generation-inference loop run for?
  const [maxTurns, setMaxTurns] = useState<number>(0);
  // What turn is the generation-inference loop currently on?
  const [currentTurn, setCurrentTurn] = useState<number>(0);

  // Test case generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTestCases, setGeneratedTestCases] = useState<GeneratedTestCase[]>([]);

  // Target test execution state
  const [targetResponses, setTargetResponses] = useState<TargetResponse[]>([]);
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Test case generation configuration state
  const [plugin, setPlugin] = useState<TargetPlugin | null>(null);
  const [strategy, setStrategy] = useState<TargetStrategy | null>(null);

  const shouldEvaluateAgainstTarget = !!redTeamConfig.target?.id;

  // Batch generation state (for single-turn strategies)
  const [testCaseBatch, setTestCaseBatch] = useState<GeneratedTestCase[]>([]);
  const [batchIndex, setBatchIndex] = useState<number>(0);
  const [isPrefetching, setIsPrefetching] = useState(false);

  // Compute available plugins from config
  const availablePlugins = useMemo(() => {
    const plugins =
      redTeamConfig.plugins?.map((p) => (typeof p === 'string' ? p : p.id)).filter(Boolean) ?? [];
    // If no plugins are configured, provide a default
    if (plugins.length === 0) {
      return [DEFAULT_PLUGIN];
    }
    return plugins;
  }, [redTeamConfig.plugins]);

  // ===================================================================
  // Refs
  // ===================================================================

  const onSuccessRef = useRef<OnGenerationSuccess | null>(null);
  const onErrorRef = useRef<OnGenerationError | null>(null);

  const testGenerationAbortController = useRef<AbortController | null>(null);
  const testExecutionAbortController = useRef<AbortController | null>(null);
  const prefetchAbortController = useRef<AbortController | null>(null);

  // ===================================================================
  // Callbacks
  // ===================================================================

  /**
   * Generates a single test case for the currently-scoped plugin and strategy.
   */
  const generateTestCase = useCallback(
    async (abortController: AbortController) => {
      if (!plugin || !strategy) {
        return;
      }

      try {
        recordEvent('feature_used', {
          feature: 'redteam_generate_test_case',
          plugin: plugin!.id,
          strategy: strategy!.id,
        });

        const history = getHistory(generatedTestCases, targetResponses);

        const response = await callTestGenerationApi(
          plugin,
          strategy,
          redTeamConfig.applicationDefinition.purpose ?? null,
          abortController,
          history,
          currentTurn,
          maxTurns,
        );

        const data = await response.json();

        if (data.error) {
          throw new Error(data?.details ?? data.error);
        }

        setGeneratedTestCases((prev) => [
          ...prev,
          {
            prompt: data.prompt,
            context: data.context,
            metadata: data.metadata,
          },
        ]);
      } catch (error) {
        // Ignore abort errors (these happen when a new generation is triggered)
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        console.error('Failed to generate test case:', error);

        const errorMessage =
          error instanceof Error
            ? error.message.includes('timed out')
              ? 'Test generation timed out. Please try again or check your connection.'
              : error.message
            : 'Failed to generate test case';

        toast.showToast(errorMessage, 'error', ERROR_MSG_DURATION);

        // Abort any pending test execution
        setIsRunningTest(false);

        setIsDialogOpen(false);

        setPlugin(null);
        setStrategy(null);
        setIsGenerating(false);

        onErrorRef.current?.(error as Error);
      }
    },
    [
      plugin,
      strategy,
      redTeamConfig,
      recordEvent,
      toast,
      generatedTestCases,
      targetResponses,
      currentTurn,
      maxTurns,
    ],
  );

  /**
   * Sends a generated test case to the target for evaluation.
   */
  const executeTest = useCallback(
    async (abortController: AbortController) => {
      // Capture generatedTestCase to avoid stale closure if state changes during async execution
      const testCase = generatedTestCases[generatedTestCases.length - 1];
      // Guard: if test case was reset (e.g., by a new generation), abort execution
      if (!testCase) {
        return;
      }

      // Run against target if configured
      setIsRunningTest(true);

      try {
        const testResponse = await callTestExecutionApi(
          redTeamConfig.target,
          testCase.prompt,
          abortController,
        );

        if (!testResponse.ok) {
          const errorData = await testResponse.json();
          throw new Error(errorData.error || 'Failed to run test');
        }

        const { providerResponse } = await testResponse.json();

        setTargetResponses((prev) => [
          ...prev,
          {
            output: providerResponse?.output ?? null,
            error: providerResponse?.error ?? null,
          },
        ]);

        onSuccessRef.current?.(testCase);
      } catch (error) {
        // Ignore abort errors (these happen when a new generation is triggered)
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        console.error('Failed to run test against target:', error);
        setTargetResponses((prev) => [
          ...prev,
          {
            output: null,
            error: error instanceof Error ? error.message : 'Failed to run test against target',
          },
        ]);
        onErrorRef.current?.(error as Error);
      } finally {
        setIsRunningTest(false);
      }
    },
    [generatedTestCases, redTeamConfig],
  );

  const resetState = useCallback(() => {
    setPlugin(null);
    setStrategy(null);
    setGeneratedTestCases([]);
    setTargetResponses([]);
    setCurrentTurn(0);
    setMaxTurns(0);
    setIsRunningTest(false);
    setIsGenerating(false);
    // Reset batch state
    setTestCaseBatch([]);
    setBatchIndex(0);
    setIsPrefetching(false);
    prefetchAbortController.current?.abort();
    prefetchAbortController.current = null;
    onSuccessRef.current = null;
    onErrorRef.current = null;
  }, []);

  /**
   * Generates a batch of test cases for single-turn strategies.
   * Returns array of test cases or null on error.
   */
  const generateBatch = useCallback(
    async (
      targetPlugin: TargetPlugin,
      targetStrategy: TargetStrategy,
      abortController: AbortController,
      count: number = BATCH_SIZE,
    ): Promise<GeneratedTestCase[] | null> => {
      try {
        recordEvent('feature_used', {
          feature: 'redteam_generate_test_case_batch',
          plugin: targetPlugin.id,
          strategy: targetStrategy.id,
          count,
        });

        const response = await callTestGenerationApi(
          targetPlugin,
          targetStrategy,
          redTeamConfig.applicationDefinition.purpose ?? null,
          abortController,
          [], // No history for batch generation
          0,
          1,
          count,
        );

        const data = await response.json();

        if (data.error) {
          throw new Error(data?.details ?? data.error);
        }

        // Handle batch response
        if (data.testCases && Array.isArray(data.testCases)) {
          return data.testCases as GeneratedTestCase[];
        }

        // Backward compatible: single test case response
        return [
          {
            prompt: data.prompt,
            context: data.context,
            metadata: data.metadata,
          },
        ];
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return null;
        }
        throw error;
      }
    },
    [redTeamConfig.applicationDefinition?.purpose, recordEvent],
  );

  /**
   * Prefetches the next batch of test cases in the background.
   */
  const prefetchNextBatch = useCallback(async () => {
    if (isPrefetching || !plugin || !strategy) {
      return;
    }
    // Don't prefetch for multi-turn strategies
    if (isMultiTurnStrategy(strategy.id)) {
      return;
    }

    setIsPrefetching(true);
    prefetchAbortController.current?.abort();
    prefetchAbortController.current = new AbortController();

    try {
      const newTestCases = await generateBatch(
        plugin,
        strategy,
        prefetchAbortController.current,
        BATCH_SIZE,
      );

      if (newTestCases && newTestCases.length > 0) {
        setTestCaseBatch((prev) => [...prev, ...newTestCases]);
      }
    } catch (error) {
      // Silent fail for prefetch - not critical
      console.debug('Prefetch failed:', error);
    } finally {
      setIsPrefetching(false);
    }
  }, [isPrefetching, plugin, strategy, generateBatch]);

  /**
   * Starts the test generation / execution (optional) >=1 turn loop.
   */
  const handleStart = useCallback(
    async (
      plugin: TargetPlugin,
      strategy: TargetStrategy,
      onSuccess?: OnGenerationSuccess,
      onError?: OnGenerationError,
    ) => {
      // Abort any ongoing operations & reset state
      testGenerationAbortController.current?.abort();
      testExecutionAbortController.current?.abort();
      resetState();

      if (onSuccess) {
        onSuccessRef.current = onSuccess;
      }
      if (onError) {
        onErrorRef.current = onError;
      }

      const isMultiTurn = isMultiTurnStrategy(strategy.id);
      // Don't allow multi-turn strategies to be used unless the target is configured
      if (isMultiTurn && !shouldEvaluateAgainstTarget) {
        toast.showToast(
          'Multi-turn strategies require a target to be configured.',
          'error',
          ERROR_MSG_DURATION,
        );
        return;
      }
      // Read the turn count from the strategy config
      let maxTurns = isMultiTurn ? DEFAULT_MULTI_TURN_MAX_TURNS : 1;
      if (isMultiTurn && typeof strategy.config.maxTurns === 'number') {
        maxTurns = strategy.config.maxTurns;
      }
      setMaxTurns(maxTurns);

      // Start generation
      setPlugin(plugin);
      setStrategy(strategy);
      setIsGenerating(true);
      // If test execution will be run, trigger the loading state in the dialog
      // setIsRunningTest(shouldEvaluateAgainstTarget);
      // Open dialog to show test case generation results
      setIsDialogOpen(true);
    },
    [shouldEvaluateAgainstTarget, resetState, toast],
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    resetState();
  }, [resetState]);

  /**
   * Regenerates and optionally evaluates the plugin/strategy combination.
   * Accepts an optional newPluginId to change the plugin before regenerating.
   * For single-turn strategies, uses cached batch when available.
   */
  const handleRegenerate = useCallback(
    (newPluginId?: string) => {
      // If plugin changed, clear batch and start fresh
      if (newPluginId && newPluginId !== plugin?.id) {
        // Clear batch since we're switching plugins
        setTestCaseBatch([]);
        setBatchIndex(0);

        // Look up the plugin config from redTeamConfig.plugins
        const pluginFromConfig = redTeamConfig.plugins?.find((p) =>
          typeof p === 'string' ? p === newPluginId : p.id === newPluginId,
        );
        const pluginConfig =
          typeof pluginFromConfig === 'object' ? (pluginFromConfig.config ?? {}) : {};

        handleStart(
          { id: newPluginId as Plugin, config: pluginConfig, isStatic: false },
          strategy!,
        );
        return;
      }

      // For multi-turn strategies, always regenerate fresh
      if (strategy && isMultiTurnStrategy(strategy.id)) {
        handleStart(plugin!, strategy!);
        return;
      }

      // Check if we have more test cases in the batch
      const nextIndex = batchIndex + 1;

      if (nextIndex < testCaseBatch.length) {
        // Use next test case from batch (instant prompt display!)
        setBatchIndex(nextIndex);
        // Set the new test case - prompt shows immediately
        setGeneratedTestCases([testCaseBatch[nextIndex]]);
        // Clear target responses so the execution effect triggers and shows loading state
        setTargetResponses([]);

        // Prefetch if running low on cached test cases
        const remaining = testCaseBatch.length - nextIndex;
        if (remaining <= PREFETCH_THRESHOLD && !isPrefetching) {
          prefetchNextBatch();
        }
        return;
      }

      // Batch exhausted, generate new batch
      handleStart(plugin!, strategy!);
    },
    [
      handleStart,
      plugin,
      strategy,
      redTeamConfig.plugins,
      batchIndex,
      testCaseBatch,
      isPrefetching,
      prefetchNextBatch,
    ],
  );

  const handleContinue = useCallback((additionalTurns: number) => {
    setMaxTurns((prev) => prev + additionalTurns);
    setCurrentTurn((prev) => prev + 1);
    setIsGenerating(true);
  }, []);

  // ===================================================================
  // Effects
  // ===================================================================

  /**
   * Drive the generation loop
   */
  useEffect(() => {
    // 1. Generate Test Case
    // Trigger if we are "generating", have a plugin/strategy, and haven't generated for this turn yet.
    if (isGenerating && plugin && strategy && generatedTestCases.length === currentTurn) {
      const abortController = new AbortController();
      testGenerationAbortController.current = abortController;

      // For single-turn strategies, use batch generation
      if (!isMultiTurnStrategy(strategy.id) && currentTurn === 0) {
        // Generate a batch of test cases
        generateBatch(plugin, strategy, abortController, BATCH_SIZE)
          .then((batch) => {
            if (batch && batch.length > 0) {
              // Store batch and show first test case
              setTestCaseBatch(batch);
              setBatchIndex(0);
              setGeneratedTestCases([batch[0]]);
            }
          })
          .catch((error) => {
            console.error('Failed to generate test case batch:', error);

            const errorMessage =
              error instanceof Error
                ? error.message.includes('timed out')
                  ? 'Test generation timed out. Please try again or check your connection.'
                  : error.message
                : 'Failed to generate test case';

            toast.showToast(errorMessage, 'error', ERROR_MSG_DURATION);

            setIsDialogOpen(false);
            setPlugin(null);
            setStrategy(null);
            setIsGenerating(false);

            onErrorRef.current?.(error as Error);
          });
      } else {
        // Multi-turn or subsequent turns: use single generation
        generateTestCase(abortController);
      }

      return () => abortController.abort();
    }
  }, [
    isGenerating,
    plugin,
    strategy,
    currentTurn,
    generatedTestCases.length,
    generateTestCase,
    generateBatch,
    toast,
  ]);

  /**
   * Drive the execution loop
   */
  useEffect(() => {
    // 2. Execute Test Case
    // Trigger if we have a new generated test case pending execution.
    // We know it's pending if generated > responses.
    if (generatedTestCases.length > targetResponses.length) {
      const abortController = new AbortController();
      testExecutionAbortController.current = abortController;

      if (shouldEvaluateAgainstTarget) {
        executeTest(abortController);
      } else {
        // No target, just finish this turn immediately (only for single turn)
        const testCase = generatedTestCases[generatedTestCases.length - 1];
        onSuccessRef.current?.(testCase);
        setIsGenerating(false);
      }

      return () => abortController.abort();
    }
  }, [
    generatedTestCases.length,
    targetResponses.length,
    shouldEvaluateAgainstTarget,
    executeTest,
    generatedTestCases,
  ]);

  /**
   * Drive the turn management
   */
  useEffect(() => {
    // 3. Manage Turns
    // If a turn is complete (generated == responses > 0)
    if (
      isGenerating &&
      generatedTestCases.length > 0 &&
      generatedTestCases.length === targetResponses.length &&
      // Ensure we haven't already advanced past this turn
      generatedTestCases.length === currentTurn + 1
    ) {
      const lastResponse = targetResponses[targetResponses.length - 1];
      // Stop on error
      if (lastResponse.error) {
        setIsGenerating(false);
        return;
      }

      // Next turn or finish
      if (currentTurn < maxTurns - 1) {
        setCurrentTurn((prev) => prev + 1);
      } else {
        setIsGenerating(false);
      }
    }
  }, [generatedTestCases.length, targetResponses, isGenerating, currentTurn, maxTurns]);

  // ===================================================================
  // Rendering
  // ===================================================================

  return (
    <TestCaseGenerationContext
      value={
        {
          isGenerating,
          plugin: plugin?.id ?? null,
          strategy: strategy?.id ?? null,
          generateTestCase: handleStart,
          continueGeneration: handleContinue,
        } as TestGenerationContext
      }
    >
      {children}
      <TestCaseDialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        onRegenerate={handleRegenerate}
        onContinue={handleContinue}
        plugin={plugin}
        strategy={strategy}
        isGenerating={isGenerating}
        generatedTestCases={generatedTestCases}
        targetResponses={targetResponses}
        isRunningTest={isRunningTest}
        currentTurn={currentTurn}
        maxTurns={maxTurns}
        availablePlugins={availablePlugins}
        allowPluginChange={allowPluginChange}
      />
    </TestCaseGenerationContext>
  );
};

export const useTestCaseGeneration = () => {
  const context = useContext(TestCaseGenerationContext);
  if (!context) {
    throw new Error('useTestCaseGeneration must be used within TestCaseGenerationProvider');
  }
  return context;
};
