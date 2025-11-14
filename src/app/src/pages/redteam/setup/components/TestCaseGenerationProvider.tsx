import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import {
  DEFAULT_MULTI_TURN_MAX_TURNS,
  isMultiTurnStrategy,
  type Plugin,
  type Strategy,
} from '@promptfoo/redteam/constants';
import { TestCaseDialog } from './TestCaseDialog';
import { type Config } from '../types';
import type { ConversationMessage, PluginConfig, StrategyConfig } from '@promptfoo/redteam/types';

const TEST_GENERATION_TIMEOUT = 30000; // 30s timeout
const TEST_EXECUTION_TIMEOUT = 30000; // 30s timeout
interface GeneratedTestCase {
  prompt: string;
  context?: string;
  metadata?: any;
}

interface TargetResponse {
  output: string;
  error?: string;
}

interface TargetPlugin {
  id: Plugin;
  config: PluginConfig;
}
interface TargetStrategy {
  id: Strategy;
  config: StrategyConfig;
}

interface MultiTurnState {
  history: ConversationMessage[];
  turn: number;
  maxTurns: number;
  done: boolean;
  stateful: boolean;
}

type OnGenerationSuccess = (testCase: GeneratedTestCase) => void;
type OnGenerationError = (error: Error) => void;

interface TestCaseGenerationContextValue {
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
}

const TestCaseGenerationContext = createContext<TestCaseGenerationContextValue | undefined>(
  undefined,
);

interface TestCaseGenerationProviderProps {
  children: React.ReactNode;
  redTeamConfig: Config;
}

/**
 * Orchestrates test case generation and target test execution. Generation and execution are run in
 * separate effects to allow for independent view updates at each stage.
 */
export const TestCaseGenerationProvider: React.FC<TestCaseGenerationProviderProps> = ({
  children,
  redTeamConfig,
}) => {
  // Test case generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTestCase, setGeneratedTestCase] = useState<GeneratedTestCase | null>(null);
  // Target test execution state
  const [targetResponse, setTargetResponse] = useState<TargetResponse | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);
  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Multi-turn state
  const [multiTurnState, setMultiTurnState] = useState<MultiTurnState | null>(null);
  const multiTurnStateRef = useRef<MultiTurnState | null>(null);
  const multiTurnContextRef = useRef<{
    goal?: string;
    instructions?: string;
  } | null>(null);

  // Test case generation configuration state
  const [plugin, setPlugin] = useState<TargetPlugin | null>(null);
  const [strategy, setStrategy] = useState<TargetStrategy | null>(null);

  const { recordEvent } = useTelemetry();
  const toast = useToast();

  const onSuccessRef = useRef<OnGenerationSuccess | null>(null);
  const onErrorRef = useRef<OnGenerationError | null>(null);

  const testGenerationAbortController = useRef<AbortController | null>(null);
  const testExecutionAbortController = useRef<AbortController | null>(null);

  const shouldEvaluateAgainstTarget = !!redTeamConfig.target?.id;

  const runSingleTurn = useCallback(async (abortController: AbortController) => {
    if (!plugin || !strategy) {
      return;
    }

    try {
      recordEvent('feature_used', {
        feature: 'redteam_generate_test_case',
        plugin: plugin.id,
        strategy: strategy.id,
      });

      const response = await callApi('/redteam/generate-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
        body: JSON.stringify({
          plugin,
          strategy,
          config: {
            applicationDefinition: {
              purpose: redTeamConfig.applicationDefinition.purpose ?? null,
            },
          },
        }),
        signal: AbortSignal.any([
          AbortSignal.timeout(TEST_GENERATION_TIMEOUT),
          abortController.signal,
        ]),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      setGeneratedTestCase({
        prompt: data.prompt,
        context: data.context,
        metadata: data.metadata,
      });
    } catch (error) {
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

      toast.showToast(errorMessage, 'error');
      setIsRunningTest(false);
      setIsDialogOpen(false);
      setPlugin(null);
      setStrategy(null);
      onErrorRef.current?.(error as Error);
    } finally {
      setIsGenerating(false);
    }
  }, [plugin, strategy, redTeamConfig, recordEvent, toast]);

  const runMultiTurn = useCallback(async (abortController: AbortController) => {
    if (!plugin || !strategy) {
      return;
    }

    try {
      recordEvent('feature_used', {
        feature: 'redteam_generate_test_case',
        plugin: plugin.id,
        strategy: strategy.id,
      });

      let state =
        multiTurnStateRef.current ??
        ({
          history: [],
          turn: 0,
          maxTurns: DEFAULT_MULTI_TURN_MAX_TURNS,
          done: false,
          stateful: false,
        } satisfies MultiTurnState);

      multiTurnStateRef.current = state;
      setMultiTurnState(state);

      let goal = multiTurnContextRef.current?.goal;
      let instructions = multiTurnContextRef.current?.instructions;
      let lastGenerated: GeneratedTestCase | null = null;

      const strategyConfig = strategy.config as Record<string, unknown>;
      if (!goal && typeof strategyConfig?.goal === 'string') {
        goal = String(strategyConfig.goal);
      }
      if (!instructions && typeof strategyConfig?.instructions === 'string') {
        instructions = String(strategyConfig.instructions);
      }

      while (!abortController.signal.aborted && !state.done && state.turn < state.maxTurns) {
        const generationResponse = await callApi('/redteam/generate-test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
          body: JSON.stringify({
            plugin,
            strategy,
            config: {
              applicationDefinition: {
                purpose: redTeamConfig.applicationDefinition.purpose ?? null,
              },
            },
            turn: state.turn,
            maxTurns: state.maxTurns,
            history: state.history,
            goal,
            stateful: state.stateful,
          }),
          signal: AbortSignal.any([AbortSignal.timeout(10000), abortController.signal]),
        });

        if (!generationResponse.ok) {
          const errorData = await generationResponse.json();
          throw new Error(errorData.error || 'Failed to generate test case');
        }

        const data = await generationResponse.json();

        if (data.error) {
          throw new Error(data.error);
        }

        goal = data.metadata?.goal ?? goal;
        instructions = data.metadata?.instructions ?? instructions;

        const multiTurnMeta = data.metadata?.multiTurn ?? {};
        state = {
          ...state,
          maxTurns:
            typeof multiTurnMeta.maxTurns === 'number' ? multiTurnMeta.maxTurns : state.maxTurns,
          done: Boolean(multiTurnMeta.done),
          stateful:
            typeof multiTurnMeta.stateful === 'boolean' ? multiTurnMeta.stateful : state.stateful,
        } satisfies MultiTurnState;

        multiTurnContextRef.current = {
          goal,
          instructions,
        };

        lastGenerated = {
          prompt: data.prompt,
          context: data.context,
          metadata: data.metadata,
        };
        setGeneratedTestCase(lastGenerated);

        if (abortController.signal.aborted) {
          break;
        }

        const promptText = String(data.prompt ?? '').trim();
        if (!promptText) {
          throw new Error('Received empty prompt for multi-turn generation');
        }

        if (promptText === '###STOP###') {
          state = {
            ...state,
            done: true,
          };
          multiTurnStateRef.current = state;
          setMultiTurnState(state);
          break;
        }

        let assistantOutput: string | undefined;
        if (shouldEvaluateAgainstTarget) {
          const executionAbortController = new AbortController();
          testExecutionAbortController.current = executionAbortController;
          setIsRunningTest(true);
          setTargetResponse(null);

          try {
            const testResponse = await callApi('/providers/test', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                providerOptions: redTeamConfig.target,
                prompt: promptText,
              }),
              signal: AbortSignal.any([
                AbortSignal.timeout(TEST_EXECUTION_TIMEOUT),
                executionAbortController.signal,
                abortController.signal,
              ]),
            });

            if (!testResponse.ok) {
              const errorData = await testResponse.json();
              throw new Error(errorData.error || 'Failed to run test');
            }

            const testData = await testResponse.json();
            assistantOutput = testData.providerResponse?.output || '';
            setTargetResponse({
              output: assistantOutput ?? '',
              error: testData.providerResponse?.error || testData.testResult?.error,
            });
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
              return;
            }

            console.error('Failed to run test against target:', error);
            const errorMessage =
              error instanceof Error ? error.message : 'Failed to run test against target';
            setTargetResponse({
              output: '',
              error: errorMessage,
            });
            toast.showToast(errorMessage, 'error');
            onErrorRef.current?.(error as Error);
            return;
          } finally {
            setIsRunningTest(false);
          }
        }

        const updatedHistory: ConversationMessage[] = [
          ...state.history,
          { role: 'user', content: promptText },
        ];

        if (shouldEvaluateAgainstTarget && typeof assistantOutput === 'string') {
          updatedHistory.push({ role: 'assistant', content: assistantOutput });
        }

        if (!shouldEvaluateAgainstTarget) {
          state = {
            ...state,
            history: updatedHistory,
            turn: state.turn + 1,
            done: true,
          };
          multiTurnStateRef.current = state;
          setMultiTurnState(state);
          break;
        }

        const reachedMaxTurns = state.turn + 1 >= state.maxTurns;
        state = {
          ...state,
          history: updatedHistory,
          turn: state.turn + 1,
          done: state.done || reachedMaxTurns,
        } satisfies MultiTurnState;
        multiTurnStateRef.current = state;
        setMultiTurnState(state);

        multiTurnContextRef.current = {
          goal,
          instructions,
        };

        if (state.done) {
          break;
        }
      }

      if (!abortController.signal.aborted && lastGenerated) {
        const mergedMetadata = {
          ...(lastGenerated.metadata ?? {}),
          goal,
          instructions,
          multiTurn: {
            ...(lastGenerated.metadata?.multiTurn ?? {}),
            history: state.history,
            turn: state.turn,
            maxTurns: state.maxTurns,
            done: state.done,
            stateful: state.stateful,
          },
        };

        const finalTestCase: GeneratedTestCase = {
          ...lastGenerated,
          metadata: mergedMetadata,
        };

        setGeneratedTestCase(finalTestCase);
        onSuccessRef.current?.(finalTestCase);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error('Failed to generate multi-turn test case:', error);
      const errorMessage =
        error instanceof Error
          ? error.message.includes('timed out')
            ? 'Test generation timed out. Please try again or check your connection.'
            : error.message
          : 'Failed to generate test case';

      toast.showToast(errorMessage, 'error');
      setIsRunningTest(false);
      setIsDialogOpen(false);
      setPlugin(null);
      setStrategy(null);
      onErrorRef.current?.(error as Error);
    } finally {
      setIsGenerating(false);
    }
  }, [plugin, strategy, redTeamConfig, recordEvent, toast]);

  /**
   * Test Case Generation
   */
  useEffect(() => {
    if (!isGenerating || !plugin || !strategy) {
      return;
    }
    // Setup abort controller for test generation
    const abortController = new AbortController();
    testGenerationAbortController.current = abortController;

    // Determine if the strategy is a multi-turn strategy
    const isMultiTurn = isMultiTurnStrategy(strategy.id);
    const caller = isMultiTurn ? runMultiTurn : runSingleTurn;
    caller(abortController);

    return () => {
      abortController.abort();
    };
  }, [
    isGenerating,
    plugin,
    strategy,
    redTeamConfig,
    recordEvent,
    toast,
    shouldEvaluateAgainstTarget,
  ]);

  /**
   * On test case generation success, either trigger target test execution or call onSuccess callback.
   */
  useEffect(() => {
    const abortController = new AbortController();
    testExecutionAbortController.current = abortController;

    if (multiTurnStateRef.current) {
      return () => {
        abortController.abort();
      };
    }

    async function executeTest() {
      // Capture generatedTestCase to avoid stale closure if state changes during async execution
      const testCase = generatedTestCase;
      // Guard: if test case was reset (e.g., by a new generation), abort execution
      if (!testCase) {
        return;
      }

      // Run against target if configured
      setIsRunningTest(true);
      setTargetResponse(null);

      try {
        const testResponse = await callApi('/providers/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            providerOptions: redTeamConfig.target,
            prompt: testCase.prompt,
          }),
          signal: AbortSignal.any([
            AbortSignal.timeout(TEST_EXECUTION_TIMEOUT),
            abortController.signal,
          ]),
        });

        if (!testResponse.ok) {
          const errorData = await testResponse.json();
          throw new Error(errorData.error || 'Failed to run test');
        }

        const testData = await testResponse.json();

        // TODO(Will): Ensure the testData.providerResponse is correctly deserialized

        setTargetResponse({
          output: testData.providerResponse?.output || '',
          error: testData.providerResponse?.error || testData.testResult?.error,
        });

        onSuccessRef.current?.(testCase);
      } catch (error) {
        // Ignore abort errors (these happen when a new generation is triggered)
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        console.error('Failed to run test against target:', error);
        setTargetResponse({
          output: '',
          error: error instanceof Error ? error.message : 'Failed to run test against target',
        });
        onErrorRef.current?.(error as Error);
      } finally {
        setIsRunningTest(false);
      }
    }
    if (!!generatedTestCase) {
      const testCase = generatedTestCase; // Capture to avoid stale closure
      if (shouldEvaluateAgainstTarget) {
        executeTest();
      } else {
        onSuccessRef.current?.(testCase);
      }
    }

    // Cleanup: abort when effect dependencies change or component unmounts
    return () => {
      abortController.abort();
    };
  }, [generatedTestCase, shouldEvaluateAgainstTarget]);

  const resetState = useCallback(() => {
    setPlugin(null);
    setStrategy(null);
    setGeneratedTestCase(null);
    setTargetResponse(null);
    setIsRunningTest(false);
    setIsGenerating(false);
    setMultiTurnState(null);
    multiTurnStateRef.current = null;
    multiTurnContextRef.current = null;
    onSuccessRef.current = null;
    onErrorRef.current = null;
  }, []);

  /**
   * Triggers test generation and optionally runs a target test.
   */
  const generateTestCase = useCallback(
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

      const strategyConfig = strategy.config as Record<string, unknown>;
      if (isMultiTurnStrategy(strategy.id)) {
        const initialMaxTurns =
          typeof strategyConfig?.maxTurns === 'number'
            ? Number(strategyConfig.maxTurns)
            : DEFAULT_MULTI_TURN_MAX_TURNS;
        const initialState: MultiTurnState = {
          history: [],
          turn: 0,
          maxTurns: initialMaxTurns,
          done: false,
          stateful: Boolean(strategyConfig?.stateful),
        };
        multiTurnStateRef.current = initialState;
        setMultiTurnState(initialState);
        multiTurnContextRef.current = null;
      } else {
        multiTurnStateRef.current = null;
        setMultiTurnState(null);
        multiTurnContextRef.current = null;
      }

      // Start generation
      setPlugin(plugin);
      setStrategy(strategy);
      setIsGenerating(true);
      // If test execution will be run, trigger the loading state in the dialog
      setIsRunningTest(shouldEvaluateAgainstTarget);
      // Open dialog to show test case generation results
      setIsDialogOpen(true);
    },
    [shouldEvaluateAgainstTarget, resetState],
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    resetState();
  }, [resetState]);

  /**
   * Regenerates and optionally evaluates the plugin/strategy combination.
   */
  const handleRegenerate = useCallback(() => {
    generateTestCase(plugin!, strategy!);
  }, [generateTestCase, plugin, strategy]);

  return (
    <TestCaseGenerationContext.Provider
      value={{
        isGenerating,
        plugin: plugin?.id ?? null,
        strategy: strategy?.id ?? null,
        generateTestCase,
      }}
    >
      {children}
      <TestCaseDialog
        open={isDialogOpen}
        onClose={handleCloseDialog}
        onRegenerate={handleRegenerate}
        plugin={plugin?.id ?? null}
        strategy={strategy?.id ?? null}
        isGenerating={isGenerating}
        generatedTestCase={generatedTestCase}
        targetResponse={targetResponse}
        isRunningTest={isRunningTest}
      />
    </TestCaseGenerationContext.Provider>
  );
};

export const useTestCaseGeneration = () => {
  const context = useContext(TestCaseGenerationContext);
  if (!context) {
    throw new Error('useTestCaseGeneration must be used within TestCaseGenerationProvider');
  }
  return context;
};
