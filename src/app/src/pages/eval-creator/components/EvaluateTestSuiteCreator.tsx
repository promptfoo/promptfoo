import React, { useEffect, useState } from 'react';

import { PageContainer, PageHeader } from '@app/components/layout';
import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
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
import { countTests, normalizePrompts, normalizeProviders } from './setupReadiness';
import TestCasesSection from './TestCasesSection';
import YamlEditor from './YamlEditor';
import type { UnifiedConfig } from '@promptfoo/types';

type SetupStepId = 1 | 2 | 3 | 4;
type EditorTab = 'ui' | 'yaml';

interface SetupStep {
  id: SetupStepId;
  label: string;
  title: string;
  isComplete: boolean;
  count?: number;
  required: boolean;
}

function extractVarsFromPrompts(prompts: string[]): string[] {
  const varRegex = /{{\s*(\w+)\s*}}/g;
  const varsSet = new Set<string>();

  prompts.forEach((prompt) => {
    let match;
    while ((match = varRegex.exec(prompt)) !== null) {
      varsSet.add(match[1]);
    }
  });

  return Array.from(varsSet);
}

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
  const [activeStep, setActiveStep] = useState<SetupStepId>(1);
  const [editorTab, setEditorTab] = useState<EditorTab>('ui');
  const [resetKey, setResetKey] = useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { config, updateConfig, reset } = useStore();
  const { providers = [], prompts = [] } = config;

  const normalizedProviders = React.useMemo(() => normalizeProviders(providers), [providers]);

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

  const normalizedPrompts = React.useMemo(() => normalizePrompts(prompts), [prompts]);

  const varsList = React.useMemo(
    () => extractVarsFromPrompts(normalizedPrompts),
    [normalizedPrompts],
  );

  const testCount = React.useMemo(() => countTests(config.tests), [config.tests]);

  const isReadyToRun =
    normalizedProviders.length > 0 && normalizedPrompts.length > 0 && testCount > 0;

  const setupSteps: SetupStep[] = [
    {
      id: 1,
      label: 'Providers',
      title: 'Choose Providers',
      isComplete: normalizedProviders.length > 0,
      count: normalizedProviders.length,
      required: true,
    },
    {
      id: 2,
      label: 'Prompts',
      title: 'Write Prompts',
      isComplete: normalizedPrompts.length > 0,
      count: normalizedPrompts.length,
      required: true,
    },
    {
      id: 3,
      label: 'Test Cases',
      title: 'Add Test Cases',
      isComplete: testCount > 0,
      count: testCount,
      required: true,
    },
    {
      id: 4,
      label: 'Run Options',
      title: 'Run Options',
      isComplete: Boolean(config.evaluateOptions?.delay || config.evaluateOptions?.maxConcurrency),
      required: false,
    },
  ];

  const requiredSteps = setupSteps.filter((step) => step.required);
  const completedRequiredStepCount = requiredSteps.filter((step) => step.isComplete).length;
  const nextRecommendedStep =
    requiredSteps.find((step) => !step.isComplete) ?? setupSteps[setupSteps.length - 1];
  const shouldShowSummaryAction = activeStep !== nextRecommendedStep.id;

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
        if (content.trim() === '') {
          showToast(
            'The file appears to be empty. Please select a YAML file with content.',
            'error',
          );
        } else {
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
      <Tabs
        value={editorTab}
        onValueChange={(value) => setEditorTab(value as EditorTab)}
        className="w-full"
      >
        {/* Header */}
        <PageHeader>
          <div className="container max-w-7xl mx-auto px-4 py-6 lg:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Create Evaluation</h1>
                <p className="text-muted-foreground">
                  Choose what to evaluate, write prompts, and add test cases.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
                  aria-label="Upload YAML configuration"
                />
                <Button variant="outline" onClick={() => setResetDialogOpen(true)}>
                  Reset
                </Button>
              </div>
            </div>

            {/* Tabs Toggle */}
            <div className="mt-4 lg:mt-6">
              <TabsList aria-label="Editor mode">
                <TabsTrigger value="ui" className="dark:text-foreground/80">
                  UI Editor
                </TabsTrigger>
                <TabsTrigger value="yaml" className="dark:text-foreground/80">
                  YAML Editor
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
        </PageHeader>

        {/* Main Content */}
        <TabsContent value="ui">
          <div className="container max-w-7xl mx-auto px-4 py-4 lg:py-8">
            <Card className="mb-4 shadow-sm lg:mb-6">
              <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">Evaluation setup</p>
                  <h2 className="text-xl font-semibold">
                    {isReadyToRun
                      ? 'Ready to run'
                      : `${completedRequiredStepCount} of ${requiredSteps.length} required steps complete`}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isReadyToRun
                      ? 'Providers, prompts, and test cases are ready. Review run options or start the evaluation.'
                      : `Next up: ${nextRecommendedStep.title}.`}
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    {setupSteps.map((step) => {
                      const summaryStatus = step.required
                        ? step.isComplete
                          ? `${step.count} ready`
                          : 'Missing'
                        : step.isComplete
                          ? 'Configured'
                          : 'Optional';

                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setActiveStep(step.id)}
                          aria-label={`${step.label}: ${summaryStatus}`}
                          aria-current={activeStep === step.id ? 'step' : undefined}
                          className={cn(
                            'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            activeStep === step.id && 'ring-2 ring-primary',
                            step.isComplete
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50'
                              : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/60',
                          )}
                        >
                          <span className="font-medium">{step.label}</span>
                          <span className="ml-2 text-xs">{summaryStatus}</span>
                        </button>
                      );
                    })}
                  </div>

                  {shouldShowSummaryAction && (
                    <Button
                      type="button"
                      variant={isReadyToRun ? 'default' : 'outline'}
                      onClick={() => setActiveStep(nextRecommendedStep.id)}
                      className={cn(
                        'shrink-0',
                        isReadyToRun && 'dark:bg-blue-600 dark:hover:bg-blue-500',
                      )}
                    >
                      {isReadyToRun
                        ? 'Review run options'
                        : `Continue to ${nextRecommendedStep.label}`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] xl:gap-8">
              {/* Left Sidebar - Step Navigation */}
              <nav aria-label="Setup steps" className="hidden lg:block">
                <div className="space-y-2 lg:sticky lg:top-8">
                  <h3 className="mb-4 px-3 text-sm font-semibold text-muted-foreground">
                    SETUP STEPS
                  </h3>

                  <div className="grid gap-2 sm:grid-cols-2 lg:block lg:space-y-2">
                    {setupSteps.map((step) => {
                      const isOptionalComplete = !step.required && step.isComplete;

                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setActiveStep(step.id)}
                          aria-current={activeStep === step.id ? 'step' : undefined}
                          className={cn(
                            'w-full cursor-pointer rounded-lg border p-3 text-left transition-colors',
                            'hover:bg-muted/50',
                            activeStep === step.id && 'border-primary ring-2 ring-primary',
                            step.required && step.isComplete
                              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                              : isOptionalComplete
                                ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30'
                                : 'border-transparent bg-background',
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                'flex size-8 shrink-0 items-center justify-center rounded-full border-2',
                                step.required && step.isComplete
                                  ? 'border-emerald-600 bg-emerald-100 dark:border-emerald-400 dark:bg-emerald-950/30'
                                  : isOptionalComplete
                                    ? 'border-blue-600 bg-blue-100 dark:border-blue-400 dark:bg-blue-950/30'
                                    : 'border-border bg-background',
                              )}
                            >
                              {step.isComplete ? (
                                <Check
                                  className={cn(
                                    'size-4',
                                    step.required
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-blue-600 dark:text-blue-400',
                                  )}
                                />
                              ) : (
                                <span className="text-sm font-bold text-muted-foreground">
                                  {step.id}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium">{step.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {step.required
                                  ? step.isComplete
                                    ? `${step.count} configured`
                                    : 'Required'
                                  : 'Optional'}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </nav>

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
                            <strong>Getting started:</strong> Select at least one provider below.
                            You can compare multiple providers side-by-side.
                          </p>
                        </InfoBox>
                      ) : (
                        <InfoBox variant="subtle">
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
                              <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-xs text-foreground">
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
                        <InfoBox variant="subtle">
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
                      <PromptsSection onOpenYamlEditor={() => setEditorTab('yaml')} />
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
                              <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-xs text-foreground">
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
                        <InfoBox variant="subtle">
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
                      <TestCasesSection
                        varsList={varsList}
                        onOpenYamlEditor={() => setEditorTab('yaml')}
                      />
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
            <DialogTitle>Reset evaluation setup?</DialogTitle>
            <DialogDescription>
              This clears providers, prompts, test cases, and run options. This action cannot be
              undone.
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
