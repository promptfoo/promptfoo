import React, { createContext, useCallback, useContext, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import type { Plugin, Strategy } from '@promptfoo/redteam/constants';
import { TestCaseDialog } from './TestCaseDialog';
import { type Config } from '../types';
import type { PluginConfig, StrategyConfig } from '@promptfoo/redteam/types';

interface GeneratedTestCase {
  prompt: string;
  context?: string;
  metadata?: any;
}

interface TargetResponse {
  output: string;
  error?: string;
}

interface GenerateOptions {
  telemetryFeature?: string;
  onSuccess?: (testCase: GeneratedTestCase) => void;
  onError?: (error: Error) => void;
  mode?: 'config' | 'result';
}

interface TargetPlugin {
  id: Plugin;
  config: PluginConfig;
}
interface TargetStrategy {
  id: Strategy;
  config: StrategyConfig;
}

interface TestCaseGenerationContextValue {
  // State
  isGenerating: boolean;
  currentPlugin: Plugin | null;
  currentStrategy: Strategy | null;
  // Methods
  generateTestCase: (
    plugin: TargetPlugin,
    strategy: TargetStrategy,
    options?: GenerateOptions,
  ) => Promise<void>;
}

const TestCaseGenerationContext = createContext<TestCaseGenerationContextValue | undefined>(
  undefined,
);

interface TestCaseGenerationProviderProps {
  children: React.ReactNode;
  redTeamConfig: Config;
}

export const TestCaseGenerationProvider: React.FC<TestCaseGenerationProviderProps> = ({
  children,
  redTeamConfig,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTestCase, setGeneratedTestCase] = useState<GeneratedTestCase | null>(null);
  const [targetResponse, setTargetResponse] = useState<TargetResponse | null>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPlugin, setCurrentPlugin] = useState<Plugin | null>(null);
  const [currentStrategy, setCurrentStrategy] = useState<Strategy | null>(null);
  const [dialogMode, setDialogMode] = useState<'config' | 'result'>('result');

  const { recordEvent } = useTelemetry();
  const toast = useToast();

  const generateTestCase = useCallback(
    async (plugin: TargetPlugin, strategy: TargetStrategy, options: GenerateOptions = {}) => {
      setCurrentPlugin(plugin.id);
      setCurrentStrategy(strategy.id);
      setGeneratedTestCase(null);
      setIsGenerating(true);
      setDialogMode(options.mode || 'result');
      setIsDialogOpen(true);

      try {
        recordEvent('feature_used', {
          feature: options.telemetryFeature || 'redteam_generate_test_case',
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
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        const testCase: GeneratedTestCase = {
          prompt: data.prompt,
          context: data.context,
          metadata: data.metadata,
        };
        setGeneratedTestCase(testCase);

        // Run against target if configured
        if (redTeamConfig.target?.id) {
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
                prompt: data.prompt,
              }),
              signal: AbortSignal.timeout(30000), // 30s timeout
            });

            if (!testResponse.ok) {
              const errorData = await testResponse.json();
              throw new Error(errorData.error || 'Failed to run test');
            }

            const testData = await testResponse.json();
            setTargetResponse({
              output: testData.providerResponse?.output || '',
              error: testData.providerResponse?.error || testData.testResult?.error,
            });
          } catch (error) {
            console.error('Failed to run test against target:', error);
            setTargetResponse({
              output: '',
              error: error instanceof Error ? error.message : 'Failed to run test against target',
            });
          } finally {
            setIsRunningTest(false);
          }
        }

        options.onSuccess?.(testCase);
      } catch (error) {
        console.error('Failed to generate test case:', error);
        const errorMessage =
          error instanceof Error
            ? error.message.includes('timed out')
              ? 'Test generation timed out. Please try again or check your connection.'
              : error.message
            : 'Failed to generate test case';

        toast.showToast(errorMessage, 'error');
        setIsDialogOpen(false);
        setCurrentPlugin(null);
        options.onError?.(error as Error);
      } finally {
        setIsGenerating(false);
      }
    },
    [redTeamConfig, recordEvent, toast],
  );

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
    setCurrentPlugin(null);
    setGeneratedTestCase(null);
    setTargetResponse(null);
    setIsRunningTest(false);
    setDialogMode('result');
  }, []);

  return (
    <TestCaseGenerationContext.Provider
      value={{
        isGenerating,
        currentPlugin,
        currentStrategy,
        generateTestCase,
      }}
    >
      {children}
      <TestCaseDialog
        open={isDialogOpen}
        onClose={closeDialog}
        plugin={currentPlugin}
        strategy={currentStrategy}
        isGenerating={isGenerating}
        generatedTestCase={generatedTestCase}
        targetResponse={targetResponse}
        isRunningTest={isRunningTest}
        mode={dialogMode}
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
