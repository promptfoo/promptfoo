import React, { useEffect, useState } from 'react';

import { PageContainer, PageHeader } from '@app/components/layout';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/components/ui/tabs';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import yaml from 'js-yaml';
import { Check, Upload } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import ConfigureEnvButton from './ConfigureEnvButton';
import { InfoBox } from './InfoBox';
import PromptsSection from './PromptsSection';
import { ProvidersListSection } from './ProvidersListSection';
import { RunOptionsSection } from './RunOptionsSection';
import { StepSection } from './StepSection';
import TestCasesSection from './TestCasesSection';
import YamlEditor from './YamlEditor';
import type { ProviderOptions, UnifiedConfig } from '@promptfoo/types';

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown;
  resetErrorBoundary: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive"
    >
      <p className="font-medium">Something went wrong:</p>
      <pre className="mt-2 text-sm">{error instanceof Error ? error.message : String(error)}</pre>
      <Button variant="outline" size="sm" onClick={resetErrorBoundary} className="mt-3">
        Try again
      </Button>
    </div>
  );
}

const EvaluateTestSuiteCreator = () => {
  const { showToast } = useToast();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [hasCustomConfig, setHasCustomConfig] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { config, updateConfig, reset } = useStore();
  const { providers = [], prompts = [] } = config;

  // Ensure providers is always an array of ProviderOptions
  const normalizedProviders: ProviderOptions[] = React.useMemo(() => {
    if (!providers) {
      return [];
    }
    if (Array.isArray(providers)) {
      // Filter out any non-object providers (strings, functions)
      return providers.filter(
        (p): p is ProviderOptions => typeof p === 'object' && p !== null && !Array.isArray(p),
      );
    }
    return [];
  }, [providers]);

  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);

  // Fetch config status to determine if ConfigureEnvButton should be shown
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    let isMounted = true;

    const fetchConfigStatus = async () => {
      try {
        const response = await callApi('/providers/config-status');
        if (response.ok) {
          const data = await response.json();
          if (isMounted) {
            setHasCustomConfig(data.hasCustomConfig || false);
          }
        }
      } catch (err) {
        console.error('Failed to fetch provider config status:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        showToast(`Failed to load configuration status: ${errorMessage}`, 'error');
        if (isMounted) {
          setHasCustomConfig(false);
        }
      }
    };

    fetchConfigStatus();

    return () => {
      isMounted = false;
    };
  }, []);

  const extractVarsFromPrompts = (prompts: string[]): string[] => {
    const varRegex = /{{\s*(\w+)\s*}}/g;
    const varsSet = new Set<string>();

    prompts.forEach((prompt) => {
      let match;
      while ((match = varRegex.exec(prompt)) !== null) {
        varsSet.add(match[1]);
      }
    });

    return Array.from(varsSet);
  };

  // Normalize prompts to string array
  const normalizedPrompts = React.useMemo(() => {
    if (!prompts || !Array.isArray(prompts)) {
      return [];
    }

    return prompts
      .map((prompt) => {
        if (typeof prompt === 'string') {
          return prompt;
        } else if (typeof prompt === 'object' && prompt !== null && 'raw' in prompt) {
          return (prompt as { raw: string }).raw;
        }
        // For functions or other types, return empty string
        return '';
      })
      .filter((p): p is string => p !== ''); // Filter out empty strings
  }, [prompts]);

  const varsList = extractVarsFromPrompts(normalizedPrompts);

  // Get test count safely
  const testCount = React.useMemo(() => {
    return Array.isArray(config.tests) ? config.tests.length : 0;
  }, [config.tests]);

  const isReadyToRun =
    normalizedProviders.length > 0 && normalizedPrompts.length > 0 && testCount > 0;

  const handleReset = () => {
    reset();
    setResetKey((k) => k + 1);
    setResetDialogOpen(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          try {
            const parsedConfig = yaml.load(content) as Record<string, unknown>;
            if (parsedConfig && typeof parsedConfig === 'object') {
              updateConfig(parsedConfig as Partial<UnifiedConfig>);
              setResetKey((k) => k + 1);
              showToast('Configuration loaded successfully', 'success');
            } else {
              showToast('Invalid YAML configuration', 'error');
            }
          } catch (err) {
            showToast(
              `Failed to parse YAML: ${err instanceof Error ? err.message : String(err)}`,
              'error',
            );
          }
        }
      };
      reader.onerror = () => {
        showToast('Failed to read file', 'error');
      };
      reader.readAsText(file);
    }
    // Reset the input so the same file can be uploaded again
    event.target.value = '';
  };

  return (
    <PageContainer>
      <Tabs defaultValue="ui" className="w-full">
        {/* Header */}
        <PageHeader>
          <div className="container max-w-7xl mx-auto px-4 py-10">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Create Evaluation</h1>
                <p className="text-muted-foreground">
                  Configure providers, prompts, and test cases to evaluate your LLM application
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!hasCustomConfig && <ConfigureEnvButton />}
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="size-4 mr-2" />
                  Upload YAML
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".yaml,.yml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => setResetDialogOpen(true)}>
                  Reset
                </Button>
              </div>
            </div>

            {/* Tabs Toggle */}
            <div className="mt-6">
              <TabsList>
                <TabsTrigger value="ui">UI Editor</TabsTrigger>
                <TabsTrigger value="yaml">YAML Editor</TabsTrigger>
              </TabsList>
            </div>
          </div>
        </PageHeader>

        {/* Main Content */}
        <TabsContent value="ui">
          <div className="container max-w-7xl mx-auto px-4 py-8">
            <div className="flex gap-8">
              {/* Left Sidebar - Step Navigation */}
              <div className="w-64 shrink-0">
                <div className="sticky top-8 space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-4 px-3">
                    SETUP STEPS
                  </h3>

                  {/* Step 1 */}
                  <button
                    onClick={() => setActiveStep(1)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-all cursor-pointer',
                      'hover:bg-muted/50',
                      activeStep === 1 && 'ring-2 ring-primary',
                      normalizedProviders.length > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/30'
                        : 'bg-background',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex items-center justify-center size-8 rounded-full border-2 shrink-0',
                          normalizedProviders.length > 0
                            ? 'bg-emerald-100 border-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-400'
                            : 'bg-background border-border',
                        )}
                      >
                        {normalizedProviders.length > 0 ? (
                          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">1</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Choose Providers</div>
                        {normalizedProviders.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {normalizedProviders.length} configured
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Step 2 */}
                  <button
                    onClick={() => setActiveStep(2)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-all cursor-pointer',
                      'hover:bg-muted/50',
                      activeStep === 2 && 'ring-2 ring-primary',
                      normalizedPrompts.length > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/30'
                        : 'bg-background',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex items-center justify-center size-8 rounded-full border-2 shrink-0',
                          normalizedPrompts.length > 0
                            ? 'bg-emerald-100 border-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-400'
                            : 'bg-background border-border',
                        )}
                      >
                        {normalizedPrompts.length > 0 ? (
                          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">2</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Write Prompts</div>
                        {normalizedPrompts.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {normalizedPrompts.length} configured
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Step 3 */}
                  <button
                    onClick={() => setActiveStep(3)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-all cursor-pointer',
                      'hover:bg-muted/50',
                      activeStep === 3 && 'ring-2 ring-primary',
                      testCount > 0 ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-background',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex items-center justify-center size-8 rounded-full border-2 shrink-0',
                          testCount > 0
                            ? 'bg-emerald-100 border-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-400'
                            : 'bg-background border-border',
                        )}
                      >
                        {testCount > 0 ? (
                          <Check className="size-4 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">3</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Add Test Cases</div>
                        {testCount > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {testCount} configured
                          </div>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Step 4 */}
                  <button
                    onClick={() => setActiveStep(4)}
                    className={cn(
                      'w-full text-left p-3 rounded-lg transition-all cursor-pointer',
                      'hover:bg-muted/50',
                      activeStep === 4 && 'ring-2 ring-primary',
                      config.evaluateOptions?.delay || config.evaluateOptions?.maxConcurrency
                        ? 'bg-blue-50 dark:bg-blue-950/30'
                        : 'bg-background',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex items-center justify-center size-8 rounded-full border-2 shrink-0',
                          config.evaluateOptions?.delay || config.evaluateOptions?.maxConcurrency
                            ? 'bg-blue-100 border-blue-600 dark:bg-blue-950/30 dark:border-blue-400'
                            : 'bg-background border-border',
                        )}
                      >
                        {config.evaluateOptions?.delay || config.evaluateOptions?.maxConcurrency ? (
                          <Check className="size-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">4</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Run Options</div>
                        <div className="text-xs text-muted-foreground">Optional</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Right Content Area */}
              <div className="flex-1 min-w-0">
                {/* Step 1: Providers */}
                {activeStep === 1 && (
                  <StepSection
                    stepNumber={1}
                    title="Choose Providers"
                    description="Select what to evaluate: AI models, HTTP/WebSocket APIs, Python scripts, or custom code."
                    isComplete={normalizedProviders.length > 0}
                    isRequired
                    count={normalizedProviders.length}
                    defaultOpen={normalizedProviders.length === 0}
                    guidance={
                      normalizedProviders.length === 0 ? (
                        <InfoBox variant="help">
                          <strong>What are providers?</strong>
                          <p className="mt-1">
                            Providers are the systems you want to test. This can be:
                          </p>
                          <ul className="mt-2 space-y-1 list-disc list-inside ml-2">
                            <li>
                              <strong>AI Models</strong> - OpenAI GPT, Anthropic Claude, Google
                              Gemini, etc.
                            </li>
                            <li>
                              <strong>HTTP/WebSocket APIs</strong> - Your own API endpoints or
                              third-party services
                            </li>
                            <li>
                              <strong>Python Scripts</strong> - Custom Python code or agent
                              frameworks (LangChain, CrewAI, etc.)
                            </li>
                            <li>
                              <strong>JavaScript/Local Providers</strong> - Custom implementations
                            </li>
                          </ul>
                          <p className="mt-2">
                            <strong>Getting started:</strong> Select at least one provider from the
                            dropdown below. You can compare multiple providers side-by-side.
                          </p>
                        </InfoBox>
                      ) : (
                        <InfoBox variant="tip">
                          <strong>Pro tip:</strong> Testing multiple providers helps you find the
                          best option for your use case. Compare different models, API versions, or
                          custom implementations to optimize for quality, cost, and latency.
                        </InfoBox>
                      )
                    }
                  >
                    <ErrorBoundary
                      FallbackComponent={ErrorFallback}
                      onReset={() => {
                        updateConfig({ providers: [] });
                      }}
                    >
                      <ProvidersListSection
                        providers={normalizedProviders}
                        onChange={(p) => updateConfig({ providers: p })}
                      />
                    </ErrorBoundary>
                  </StepSection>
                )}

                {/* Step 2: Prompts */}
                {activeStep === 2 && (
                  <StepSection
                    stepNumber={2}
                    title="Write Prompts"
                    description="Create the prompts or inputs that will be sent to your providers. Use variables for dynamic content."
                    isComplete={normalizedPrompts.length > 0}
                    isRequired
                    count={normalizedPrompts.length}
                    defaultOpen={normalizedProviders.length > 0 && normalizedPrompts.length === 0}
                    guidance={
                      normalizedPrompts.length === 0 ? (
                        <InfoBox variant="help">
                          <strong>What are prompts?</strong>
                          <p className="mt-1">
                            Prompts are the inputs you send to your providers - whether that's
                            instructions for AI models, API request bodies, or parameters for custom
                            code.
                          </p>
                          <p className="mt-2">
                            <strong>Using variables:</strong> Use{' '}
                            <code className="bg-muted px-1 py-0.5 rounded text-xs">
                              {'{{variable_name}}'}
                            </code>{' '}
                            to create dynamic prompts. For example:{' '}
                            <code className="bg-muted px-1 py-0.5 rounded text-xs">
                              "Summarize this article: {'{{article}}'}"
                            </code>
                          </p>
                          <p className="mt-2">
                            Variables are filled in with test case data, allowing you to test the
                            same prompt with different inputs.
                          </p>
                        </InfoBox>
                      ) : varsList.length > 0 ? (
                        <InfoBox variant="info">
                          <strong>Variables detected:</strong>{' '}
                          {varsList.map((v, i) => (
                            <span key={v}>
                              <code className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xs">
                                {v}
                              </code>
                              {i < varsList.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                          <p className="mt-2">
                            These variables will need values in your test cases below. Each test
                            case should provide data for all variables.
                          </p>
                        </InfoBox>
                      ) : (
                        <InfoBox variant="tip">
                          <strong>Add variables</strong> to make your prompts more flexible. Use{' '}
                          <code className="bg-muted px-1 py-0.5 rounded text-xs">
                            {'{{variable_name}}'}
                          </code>{' '}
                          syntax to create placeholders that will be filled with test data.
                        </InfoBox>
                      )
                    }
                  >
                    <ErrorBoundary
                      FallbackComponent={ErrorFallback}
                      onReset={() => {
                        updateConfig({ prompts: [] });
                      }}
                    >
                      <PromptsSection />
                    </ErrorBoundary>
                  </StepSection>
                )}

                {/* Step 3: Test Cases */}
                {activeStep === 3 && (
                  <StepSection
                    stepNumber={3}
                    title="Add Test Cases"
                    description="Define test scenarios with input data and expected outcomes. Each case tests your prompts with different inputs."
                    isComplete={testCount > 0}
                    isRequired
                    count={testCount}
                    defaultOpen={
                      normalizedProviders.length > 0 &&
                      normalizedPrompts.length > 0 &&
                      testCount === 0
                    }
                    guidance={
                      testCount === 0 ? (
                        <InfoBox variant="help">
                          <strong>What are test cases?</strong>
                          <p className="mt-1">
                            Test cases are specific examples that evaluate how well your prompts
                            work. Each test case includes:
                          </p>
                          <ul className="mt-2 space-y-1 list-disc list-inside">
                            <li>
                              <strong>Variables:</strong> Input data that fills in your prompt
                              variables
                              {varsList.length > 0 && (
                                <>
                                  {' '}
                                  (like{' '}
                                  <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                    {varsList[0]}
                                  </code>
                                  )
                                </>
                              )}
                            </li>
                            <li>
                              <strong>Assertions:</strong> Checks to verify the AI's response
                              (optional but recommended)
                            </li>
                          </ul>
                          <p className="mt-2">
                            <strong>Example:</strong> If your prompt has a{' '}
                            <code className="bg-muted px-1 py-0.5 rounded text-xs">
                              {'{{topic}}'}
                            </code>{' '}
                            variable, each test case should provide a different topic value to test.
                          </p>
                        </InfoBox>
                      ) : varsList.length > 0 ? (
                        <InfoBox variant="info">
                          <strong>Required variables:</strong> Each test case must provide values
                          for{' '}
                          {varsList.map((v, i) => (
                            <span key={v}>
                              <code className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xs">
                                {v}
                              </code>
                              {i < varsList.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                          <p className="mt-2">
                            Add assertions to automatically check if responses meet your quality
                            standards (e.g., "contains", "matches regex", "is-json").
                          </p>
                        </InfoBox>
                      ) : (
                        <InfoBox variant="tip">
                          <strong>Add assertions</strong> to automatically verify response quality.
                          Common checks include: contains specific text, matches expected format,
                          stays within length limits, or passes custom validation.
                        </InfoBox>
                      )
                    }
                  >
                    <ErrorBoundary
                      FallbackComponent={ErrorFallback}
                      onReset={() => {
                        updateConfig({ tests: [] });
                      }}
                    >
                      <TestCasesSection varsList={varsList} />
                    </ErrorBoundary>
                  </StepSection>
                )}

                {/* Step 4: Run Options */}
                {activeStep === 4 && (
                  <StepSection
                    stepNumber={4}
                    title="Run Options"
                    description="Configure how your evaluation will run (optional but recommended for rate limiting)."
                    isComplete={
                      !!(config.evaluateOptions?.delay || config.evaluateOptions?.maxConcurrency)
                    }
                    defaultOpen={false}
                  >
                    <RunOptionsSection
                      description={config.description}
                      delay={config.evaluateOptions?.delay}
                      maxConcurrency={config.evaluateOptions?.maxConcurrency}
                      isReadyToRun={isReadyToRun}
                      onChange={(options) => {
                        const { description: newDesc, ...evalOptions } = options;
                        updateConfig({
                          description: newDesc,
                          evaluateOptions: {
                            ...config.evaluateOptions,
                            ...evalOptions,
                          },
                        });
                      }}
                    />
                  </StepSection>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* YAML Editor Tab */}
        <TabsContent value="yaml">
          <div className="container max-w-7xl mx-auto px-4 py-8">
            <YamlEditor key={resetKey} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Reset</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset all the fields? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default EvaluateTestSuiteCreator;
