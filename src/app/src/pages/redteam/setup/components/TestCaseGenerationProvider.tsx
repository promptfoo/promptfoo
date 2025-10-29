import React, { createContext, useCallback, useContext, useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import type { Plugin } from '@promptfoo/redteam/constants';
import { TestCaseDialog } from './TestCaseDialog';

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

interface TestCaseGenerationContextValue {
  // State
  isGenerating: boolean;
  generatedTestCase: GeneratedTestCase | null;
  targetResponse: TargetResponse | null;
  isRunningTest: boolean;
  isDialogOpen: boolean;
  currentPlugin: string | Plugin | null;
  dialogMode: 'config' | 'result';

  // Methods
  generateTestCase: (
    pluginId: string | Plugin,
    config: any,
    options?: GenerateOptions,
  ) => Promise<void>;
  openDialog: (pluginId: string | Plugin, mode?: 'config' | 'result') => void;
  closeDialog: () => void;
  setDialogMode: (mode: 'config' | 'result') => void;
}

const TestCaseGenerationContext = createContext<TestCaseGenerationContextValue | undefined>(
  undefined,
);

interface TestCaseGenerationProviderProps {
  children: React.ReactNode;
  redTeamConfig: any; // from useRedTeamConfig
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
  const [currentPlugin, setCurrentPlugin] = useState<string | Plugin | null>(null);
  const [dialogMode, setDialogMode] = useState<'config' | 'result'>('result');

  const { recordEvent } = useTelemetry();
  const toast = useToast();

  const generateTestCase = useCallback(
    async (pluginId: string | Plugin, config: any, options: GenerateOptions = {}) => {
      setCurrentPlugin(pluginId);
      setGeneratedTestCase(null);
      setIsGenerating(true);
      setDialogMode(options.mode || 'result');
      setIsDialogOpen(true);

      try {
        recordEvent('feature_used', {
          feature: options.telemetryFeature || 'redteam_generate_test_case',
          plugin: pluginId,
        });

        const response = await callApi('/redteam/generate-test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
          body: JSON.stringify({
            pluginId,
            config: {
              applicationDefinition: redTeamConfig.applicationDefinition,
              ...config,
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
          // Validate target URL for HTTP providers
          const targetConfig = redTeamConfig.target.config;
          const isHttpProvider = redTeamConfig.target.id === 'http' || targetConfig?.type === 'http';
          const targetUrl = targetConfig?.url;

          if (isHttpProvider && (!targetUrl || targetUrl.trim() === '' || targetUrl === 'http')) {
            setTargetResponse({
              output: '',
              error:
                'Please configure a valid HTTP URL for your target before testing. Go to the Targets tab to set up your endpoint.',
            });
          } else {
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
              let errorMessage = 'Failed to run test against target';
              if (error instanceof Error) {
                // Improve URL-related error messages
                if (
                  error.message.includes('Failed to parse URL') ||
                  error.message.includes('Invalid URL')
                ) {
                  errorMessage =
                    'Invalid target URL. Please configure a valid HTTP URL in the Targets tab.';
                } else {
                  errorMessage = error.message;
                }
              }
              setTargetResponse({
                output: '',
                error: errorMessage,
              });
            } finally {
              setIsRunningTest(false);
            }
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

  const openDialog = useCallback(
    (pluginId: string | Plugin, mode: 'config' | 'result' = 'result') => {
      setCurrentPlugin(pluginId);
      setDialogMode(mode);
      setIsDialogOpen(true);
    },
    [],
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
        generatedTestCase,
        targetResponse,
        isRunningTest,
        isDialogOpen,
        currentPlugin,
        dialogMode,
        generateTestCase,
        openDialog,
        closeDialog,
        setDialogMode,
      }}
    >
      {children}
      <TestCaseDialog
        open={isDialogOpen}
        onClose={closeDialog}
        plugin={currentPlugin}
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
