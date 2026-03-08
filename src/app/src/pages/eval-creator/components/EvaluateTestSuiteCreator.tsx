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
import { type EvalConfigState, useStore } from '@app/stores/evalConfig';
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

const STEP_ACCENT_STYLES = {
  blue: {
    completeBadge: 'bg-blue-100 border-blue-600 dark:bg-blue-950/30 dark:border-blue-400',
    completeCard: 'bg-blue-50 dark:bg-blue-950/30',
    completeIcon: 'text-blue-600 dark:text-blue-400',
  },
  emerald: {
    completeBadge:
      'bg-emerald-100 border-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-400',
    completeCard: 'bg-emerald-50 dark:bg-emerald-950/30',
    completeIcon: 'text-emerald-600 dark:text-emerald-400',
  },
} as const;

type UpdateEvalConfig = EvalConfigState['updateConfig'];

function normalizeProviders(providers: Partial<UnifiedConfig>['providers']): ProviderOptions[] {
  if (!Array.isArray(providers)) {
    return [];
  }

  return providers.filter(
    (provider): provider is ProviderOptions =>
      typeof provider === 'object' && provider !== null && !Array.isArray(provider),
  );
}

function normalizePrompts(prompts: Partial<UnifiedConfig>['prompts']): string[] {
  if (!Array.isArray(prompts)) {
    return [];
  }

  return prompts
    .map((prompt) => {
      if (typeof prompt === 'string') {
        return prompt;
      }

      if (typeof prompt === 'object' && prompt !== null && 'raw' in prompt) {
        return (prompt as { raw: string }).raw;
      }

      return '';
    })
    .filter((prompt): prompt is string => prompt !== '');
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

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        resolve(content);
        return;
      }

      reject(new Error('Invalid file contents'));
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

async function parseUploadedConfig(file: File): Promise<Partial<UnifiedConfig> | null> {
  const content = await readFileAsText(file);
  const parsedConfig = yaml.load(content) as Record<string, unknown>;

  if (!parsedConfig || typeof parsedConfig !== 'object') {
    return null;
  }

  return parsedConfig as Partial<UnifiedConfig>;
}

function VariablesList({ varsList }: { varsList: string[] }) {
  return varsList.map((variable, index) => (
    <span key={variable}>
      <code className="bg-primary/20 text-primary px-1.5 py-0.5 rounded text-xs">{variable}</code>
      {index < varsList.length - 1 ? ', ' : ''}
    </span>
  ));
}

function useProviderConfigStatus(showToast: ReturnType<typeof useToast>['showToast']): boolean {
  const [hasCustomConfig, setHasCustomConfig] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchConfigStatus = async () => {
      try {
        const response = await callApi('/providers/config-status');
        if (!response.ok) {
          if (isMounted) {
            setHasCustomConfig(false);
          }
          return;
        }

        const data = await response.json();
        if (isMounted) {
          setHasCustomConfig(data.hasCustomConfig || false);
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
  }, [showToast]);

  return hasCustomConfig;
}

function SetupStepButton({
  accent,
  detail,
  isActive,
  isComplete,
  onClick,
  stepNumber,
  title,
}: {
  accent: keyof typeof STEP_ACCENT_STYLES;
  detail?: string;
  isActive: boolean;
  isComplete: boolean;
  onClick: () => void;
  stepNumber: number;
  title: string;
}) {
  const styles = STEP_ACCENT_STYLES[accent];

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg transition-all cursor-pointer',
        'hover:bg-muted/50',
        isActive && 'ring-2 ring-primary',
        isComplete ? styles.completeCard : 'bg-background',
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex items-center justify-center size-8 rounded-full border-2 shrink-0',
            isComplete ? styles.completeBadge : 'bg-background border-border',
          )}
        >
          {isComplete ? (
            <Check className={cn('size-4', styles.completeIcon)} />
          ) : (
            <span className="text-sm font-bold text-muted-foreground">{stepNumber}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
        </div>
      </div>
    </button>
  );
}

function SetupStepsSidebar({
  activeStep,
  onStepChange,
  providerCount,
  promptCount,
  testCount,
  hasRunOptions,
}: {
  activeStep: number;
  onStepChange: (step: number) => void;
  providerCount: number;
  promptCount: number;
  testCount: number;
  hasRunOptions: boolean;
}) {
  const steps = [
    {
      accent: 'emerald',
      detail: providerCount > 0 ? `${providerCount} configured` : undefined,
      id: 1,
      isComplete: providerCount > 0,
      title: 'Choose Providers',
    },
    {
      accent: 'emerald',
      detail: promptCount > 0 ? `${promptCount} configured` : undefined,
      id: 2,
      isComplete: promptCount > 0,
      title: 'Write Prompts',
    },
    {
      accent: 'emerald',
      detail: testCount > 0 ? `${testCount} configured` : undefined,
      id: 3,
      isComplete: testCount > 0,
      title: 'Add Test Cases',
    },
    {
      accent: 'blue',
      detail: 'Optional',
      id: 4,
      isComplete: hasRunOptions,
      title: 'Run Options',
    },
  ] as const;

  return (
    <div className="w-64 shrink-0">
      <div className="sticky top-8 space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground mb-4 px-3">SETUP STEPS</h3>
        {steps.map((step) => (
          <SetupStepButton
            key={step.id}
            accent={step.accent}
            detail={step.detail}
            isActive={activeStep === step.id}
            isComplete={step.isComplete}
            onClick={() => onStepChange(step.id)}
            stepNumber={step.id}
            title={step.title}
          />
        ))}
      </div>
    </div>
  );
}

function ProvidersSetupStep({
  normalizedProviders,
  updateConfig,
}: {
  normalizedProviders: ProviderOptions[];
  updateConfig: UpdateEvalConfig;
}) {
  return (
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
            <p className="mt-1">Providers are the systems you want to test. This can be:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside ml-2">
              <li>
                <strong>AI Models</strong> - OpenAI GPT, Anthropic Claude, Google Gemini, etc.
              </li>
              <li>
                <strong>HTTP/WebSocket APIs</strong> - Your own API endpoints or third-party
                services
              </li>
              <li>
                <strong>Python Scripts</strong> - Custom Python code or agent frameworks (LangChain,
                CrewAI, etc.)
              </li>
              <li>
                <strong>JavaScript/Local Providers</strong> - Custom implementations
              </li>
            </ul>
            <p className="mt-2">
              <strong>Getting started:</strong> Select at least one provider below. You can compare
              multiple providers side-by-side.
            </p>
          </InfoBox>
        ) : (
          <InfoBox variant="tip">
            <strong>Pro tip:</strong> Testing multiple providers helps you find the best option for
            your use case. Compare different models, API versions, or custom implementations to
            optimize for quality, cost, and latency.
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
          onChange={(providers) => updateConfig({ providers })}
        />
      </ErrorBoundary>
    </StepSection>
  );
}

function PromptsSetupStep({
  normalizedPrompts,
  normalizedProviders,
  updateConfig,
  varsList,
}: {
  normalizedPrompts: string[];
  normalizedProviders: ProviderOptions[];
  updateConfig: UpdateEvalConfig;
  varsList: string[];
}) {
  return (
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
              Prompts are the inputs you send to your providers - whether that's instructions for AI
              models, API request bodies, or parameters for custom code.
            </p>
            <p className="mt-2">
              <strong>Using variables:</strong> Use{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{variable_name}}'}</code> to
              create dynamic prompts. For example:{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                "Summarize this article: {'{{article}}'}"
              </code>
            </p>
            <p className="mt-2">
              Variables are filled in with test case data, allowing you to test the same prompt with
              different inputs.
            </p>
          </InfoBox>
        ) : varsList.length > 0 ? (
          <InfoBox variant="info">
            <strong>Variables detected:</strong> <VariablesList varsList={varsList} />
            <p className="mt-2">
              These variables will need values in your test cases below. Each test case should
              provide data for all variables.
            </p>
          </InfoBox>
        ) : (
          <InfoBox variant="tip">
            <strong>Add variables</strong> to make your prompts more flexible. Use{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{variable_name}}'}</code>{' '}
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
  );
}

function TestCasesSetupStep({
  normalizedPrompts,
  normalizedProviders,
  testCount,
  updateConfig,
  varsList,
}: {
  normalizedPrompts: string[];
  normalizedProviders: ProviderOptions[];
  testCount: number;
  updateConfig: UpdateEvalConfig;
  varsList: string[];
}) {
  return (
    <StepSection
      stepNumber={3}
      title="Add Test Cases"
      description="Define test scenarios with input data and expected outcomes. Each case tests your prompts with different inputs."
      isComplete={testCount > 0}
      isRequired
      count={testCount}
      defaultOpen={
        normalizedProviders.length > 0 && normalizedPrompts.length > 0 && testCount === 0
      }
      guidance={
        testCount === 0 ? (
          <InfoBox variant="help">
            <strong>What are test cases?</strong>
            <p className="mt-1">
              Test cases are specific examples that evaluate how well your prompts work. Each test
              case includes:
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>
                <strong>Variables:</strong> Input data that fills in your prompt variables
                {varsList.length > 0 && (
                  <>
                    {' '}
                    (like{' '}
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">{varsList[0]}</code>)
                  </>
                )}
              </li>
              <li>
                <strong>Assertions:</strong> Checks to verify the AI&apos;s response (optional but
                recommended)
              </li>
            </ul>
            <p className="mt-2">
              <strong>Example:</strong> If your prompt has a{' '}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">{'{{topic}}'}</code> variable,
              each test case should provide a different topic value to test.
            </p>
          </InfoBox>
        ) : varsList.length > 0 ? (
          <InfoBox variant="info">
            <strong>Required variables:</strong> Each test case must provide values for{' '}
            <VariablesList varsList={varsList} />
            <p className="mt-2">
              Add assertions to automatically check if responses meet your quality standards (e.g.,
              "contains", "matches regex", "is-json").
            </p>
          </InfoBox>
        ) : (
          <InfoBox variant="tip">
            <strong>Add assertions</strong> to automatically verify response quality. Common checks
            include: contains specific text, matches expected format, stays within length limits, or
            passes custom validation.
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
  );
}

function RunOptionsSetupStep({
  config,
  isReadyToRun,
  updateConfig,
}: {
  config: Partial<UnifiedConfig>;
  isReadyToRun: boolean;
  updateConfig: UpdateEvalConfig;
}) {
  const hasRunOptions = Boolean(
    config.evaluateOptions?.delay || config.evaluateOptions?.maxConcurrency,
  );

  return (
    <StepSection
      stepNumber={4}
      title="Run Options"
      description="Configure how your evaluation will run (optional but recommended for rate limiting)."
      isComplete={hasRunOptions}
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
  );
}

const EvaluateTestSuiteCreator = () => {
  const { showToast } = useToast();
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const [resetKey, setResetKey] = useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { config, updateConfig, reset } = useStore();
  const hasCustomConfig = useProviderConfigStatus(showToast);
  const normalizedProviders = React.useMemo(
    () => normalizeProviders(config.providers),
    [config.providers],
  );
  const normalizedPrompts = React.useMemo(() => normalizePrompts(config.prompts), [config.prompts]);
  const varsList = React.useMemo(
    () => extractVarsFromPrompts(normalizedPrompts),
    [normalizedPrompts],
  );
  const testCount = React.useMemo(
    () => (Array.isArray(config.tests) ? config.tests.length : 0),
    [config.tests],
  );
  const hasRunOptions = Boolean(
    config.evaluateOptions?.delay || config.evaluateOptions?.maxConcurrency,
  );
  const isReadyToRun =
    normalizedProviders.length > 0 && normalizedPrompts.length > 0 && testCount > 0;

  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);

  const handleReset = () => {
    reset();
    setResetKey((key) => key + 1);
    setResetDialogOpen(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const parsedConfig = await parseUploadedConfig(file);
      if (!parsedConfig) {
        showToast('Invalid YAML configuration', 'error');
        return;
      }

      updateConfig(parsedConfig);
      setResetKey((key) => key + 1);
      showToast('Configuration loaded successfully', 'success');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const message =
        errorMessage === 'Failed to read file'
          ? errorMessage
          : `Failed to parse YAML: ${errorMessage}`;
      showToast(message, 'error');
    }
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
              <SetupStepsSidebar
                activeStep={activeStep}
                onStepChange={setActiveStep}
                providerCount={normalizedProviders.length}
                promptCount={normalizedPrompts.length}
                testCount={testCount}
                hasRunOptions={hasRunOptions}
              />

              {/* Right Content Area */}
              <div className="flex-1 min-w-0">
                {activeStep === 1 && (
                  <ProvidersSetupStep
                    normalizedProviders={normalizedProviders}
                    updateConfig={updateConfig}
                  />
                )}

                {activeStep === 2 && (
                  <PromptsSetupStep
                    normalizedPrompts={normalizedPrompts}
                    normalizedProviders={normalizedProviders}
                    updateConfig={updateConfig}
                    varsList={varsList}
                  />
                )}

                {activeStep === 3 && (
                  <TestCasesSetupStep
                    normalizedPrompts={normalizedPrompts}
                    normalizedProviders={normalizedProviders}
                    testCount={testCount}
                    updateConfig={updateConfig}
                    varsList={varsList}
                  />
                )}

                {activeStep === 4 && (
                  <RunOptionsSetupStep
                    config={config}
                    isReadyToRun={isReadyToRun}
                    updateConfig={updateConfig}
                  />
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
