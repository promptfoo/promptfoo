/**
 * InitWizard - Main wizard component for promptfoo init.
 *
 * Orchestrates multi-step wizard flow:
 * 1. Use case selection (compare, rag, agent, redteam)
 * 2. Language selection (for rag/agent only)
 * 3. Provider selection
 * 4. Preview and confirm
 */

import fs from 'fs';
import path from 'path';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Box, Text, useApp, useInput } from 'ink';

import logger from '../../logger';
import { redteamInit } from '../../redteam/commands/init';
import telemetry, { type EventProperties } from '../../telemetry';
import type { ProviderOptions } from '../../types/providers';
import { promptfooCommand } from '../../util/promptfooCommand';
import { ProgressBar } from './components/shared/ProgressBar';
import { LanguageStep } from './components/steps/LanguageStep';
import { PreviewStep } from './components/steps/PreviewStep';
import { ProviderStep } from './components/steps/ProviderStep';
import { UseCaseStep } from './components/steps/UseCaseStep';
import type {
  FileToCreate,
  InitResult,
  InitWizardProps,
  Language,
  UseCase,
  WizardState,
} from './types';
import { generateConfigYaml, generateFiles } from './utils/configGenerator';
import { getProviderPrefix, reportProviderAPIKeyWarnings } from './utils/providers';

/**
 * Record onboarding step for telemetry.
 */
function recordOnboardingStep(step: string, properties: EventProperties = {}) {
  telemetry.record('funnel', {
    type: 'eval onboarding',
    step,
    ...properties,
  });
}

/**
 * Step definitions for the wizard.
 */
const STEPS = [
  { id: 'useCase', title: 'Select Use Case' },
  { id: 'language', title: 'Select Language' },
  { id: 'provider', title: 'Select Provider' },
  { id: 'preview', title: 'Preview & Confirm' },
];

/**
 * Get applicable steps based on current state.
 */
function getApplicableSteps(state: WizardState): typeof STEPS {
  // Language step only applies to rag/agent
  if (state.useCase === 'compare') {
    return STEPS.filter((s) => s.id !== 'language');
  }
  return STEPS;
}

export function InitWizard({ directory, onComplete, onExit }: InitWizardProps) {
  const { exit } = useApp();

  // Wizard state
  const [state, setState] = useState<WizardState>({
    currentStep: 0,
    useCase: null,
    language: null,
    providers: [],
    directory: directory || '.',
    generatedConfig: null,
    filesToCreate: [],
    isExiting: false,
    error: null,
  });

  // Track when child components are in search mode to avoid global key conflicts
  const [isChildSearching, setIsChildSearching] = useState(false);

  // Derived state
  const applicableSteps = useMemo(() => getApplicableSteps(state), [state]);
  const currentStepDef = applicableSteps[state.currentStep];
  const isLastStep = state.currentStep === applicableSteps.length - 1;
  const canGoBack = state.currentStep > 0;

  // Generate files when reaching preview step
  useEffect(() => {
    if (currentStepDef?.id === 'preview' && state.useCase && state.providers.length > 0) {
      const files = generateFiles({
        useCase: state.useCase,
        language: state.language || 'not_sure',
        providers: state.providers,
      });
      const config = generateConfigYaml({
        useCase: state.useCase,
        language: state.language || 'not_sure',
        providers: state.providers,
      });
      setState((prev) => ({
        ...prev,
        filesToCreate: files,
        generatedConfig: config,
      }));
    }
  }, [currentStepDef?.id, state.useCase, state.language, state.providers]);

  // Record start telemetry
  useEffect(() => {
    recordOnboardingStep('start');
  }, []);

  // Navigation handlers
  const goToNextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, applicableSteps.length - 1),
    }));
  }, [applicableSteps.length]);

  const goToPrevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0),
    }));
  }, []);

  // Handle use case selection
  const handleUseCaseChange = useCallback((useCase: UseCase) => {
    setState((prev) => ({ ...prev, useCase }));
  }, []);

  const handleUseCaseSubmit = useCallback(
    async (useCase: UseCase) => {
      recordOnboardingStep('choose app type', { value: useCase });

      // Special handling for redteam - delegate to existing flow
      if (useCase === 'redteam') {
        setState((prev) => ({ ...prev, isExiting: true }));
        exit();

        // Run redteam init after Ink unmounts
        // Use setImmediate + setTimeout to ensure Ink has fully unmounted
        // The delay allows the terminal to restore before redteam prompts appear
        setImmediate(() => {
          setTimeout(async () => {
            try {
              await redteamInit(state.directory);
              onComplete({
                numPrompts: 0,
                providerPrefixes: [],
                action: 'redteam',
                language: 'not_applicable',
                cancelled: false,
              });
            } catch (error) {
              logger.error(`Redteam init failed: ${error}`);
              onExit();
            }
          }, 50);
        });
        return;
      }

      setState((prev) => ({ ...prev, useCase }));
      goToNextStep();
    },
    [state.directory, onComplete, onExit, exit, goToNextStep],
  );

  // Handle language selection
  const handleLanguageChange = useCallback((language: Language) => {
    setState((prev) => ({ ...prev, language }));
  }, []);

  const handleLanguageSubmit = useCallback(
    (language: Language) => {
      recordOnboardingStep('choose language', { value: language });
      setState((prev) => ({ ...prev, language }));
      goToNextStep();
    },
    [goToNextStep],
  );

  // Handle provider selection
  const handleProviderChange = useCallback((providers: (string | ProviderOptions)[]) => {
    setState((prev) => ({ ...prev, providers }));
  }, []);

  const handleProviderSubmit = useCallback(
    (providers: (string | ProviderOptions)[]) => {
      recordOnboardingStep('choose providers', {
        value: providers.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))),
      });

      // Show API key warnings
      const warnings = reportProviderAPIKeyWarnings(providers);
      warnings.forEach((warning) => logger.warn(warning));

      setState((prev) => ({ ...prev, providers }));
      goToNextStep();
    },
    [goToNextStep],
  );

  // Track files that exist and need overwrite confirmation
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [completionMessages, setCompletionMessages] = useState<string[]>([]);

  // Check for existing files when entering preview step
  useEffect(() => {
    if (currentStepDef?.id === 'preview' && state.filesToCreate.length > 0) {
      const outDirAbsolute = path.join(process.cwd(), state.directory);
      const existing = state.filesToCreate
        .filter((file) => fs.existsSync(path.join(outDirAbsolute, file.path)))
        .map((file) => file.path);
      setExistingFiles(existing);
      setConfirmOverwrite(false);
    }
  }, [currentStepDef?.id, state.filesToCreate, state.directory]);

  // Handle preview confirm - write files
  const handleConfirm = useCallback(async () => {
    // If files exist and user hasn't confirmed overwrite yet, require confirmation
    if (existingFiles.length > 0 && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }

    // Prevent double-clicks during writing
    if (isWriting) {
      return;
    }

    setIsWriting(true);
    const messages: string[] = [];

    try {
      const outDirAbsolute = path.join(process.cwd(), state.directory);

      // Create directory if needed
      if (!fs.existsSync(outDirAbsolute)) {
        fs.mkdirSync(outDirAbsolute, { recursive: true });
      }

      // Write files
      for (const file of state.filesToCreate) {
        const filePath = path.join(outDirAbsolute, file.path);
        fs.writeFileSync(filePath, file.contents);
        messages.push(`✓ Wrote ${path.join(state.directory, file.path)}`);
      }

      recordOnboardingStep('complete');

      // Build success message using promptfooCommand
      const evalCmd = promptfooCommand('');
      if (state.directory === '.') {
        messages.push(`\n✅ Run \`${evalCmd} eval\` to get started!`);
      } else {
        messages.push(`\n✅ Wrote promptfooconfig.yaml to ./${state.directory}`);
        messages.push(`Run \`cd ${state.directory}\` and then \`${evalCmd} eval\` to get started!`);
      }

      setCompletionMessages(messages);

      // Count actual prompts from config (not just the number of config files)
      // The prompts are generated based on use case and provider count
      const numProviders = state.providers.length;
      const numPrompts = state.useCase === 'compare' && numProviders < 3 ? 2 : 1;

      onComplete({
        numPrompts,
        providerPrefixes: state.providers.map((p) => getProviderPrefix(p)),
        action: state.useCase || 'compare',
        language: state.language || 'not_sure',
        cancelled: false,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
      }));
      setIsWriting(false);
    }
  }, [state, onComplete, existingFiles, confirmOverwrite, isWriting]);

  // Global keyboard handler for back/exit
  useInput(
    (input, key) => {
      // Skip global handlers when child is in search mode (avoid conflicts)
      if (isChildSearching) {
        return;
      }

      // Exit on q or Escape (except during preview which handles its own)
      if (currentStepDef?.id !== 'preview') {
        if (input === 'q' || key.escape) {
          recordOnboardingStep('early exit');
          onExit();
          exit();
        }

        // Back on Backspace
        if (key.backspace && canGoBack) {
          goToPrevStep();
        }
      }
    },
    { isActive: !state.isExiting },
  );

  // Don't render if exiting
  if (state.isExiting) {
    return null;
  }

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          promptfoo init
        </Text>
      </Box>

      {/* Progress indicator */}
      <ProgressBar
        currentStep={state.currentStep}
        totalSteps={applicableSteps.length}
        stepTitles={applicableSteps.map((s) => s.title)}
      />

      {/* Step content */}
      <Box marginTop={1} flexDirection="column">
        {currentStepDef?.id === 'useCase' && (
          <UseCaseStep
            value={state.useCase}
            onChange={handleUseCaseChange}
            onSubmit={handleUseCaseSubmit}
          />
        )}

        {currentStepDef?.id === 'language' && (
          <LanguageStep
            value={state.language}
            onChange={handleLanguageChange}
            onSubmit={handleLanguageSubmit}
          />
        )}

        {currentStepDef?.id === 'provider' && state.useCase && (
          <ProviderStep
            useCase={state.useCase}
            value={state.providers}
            onChange={handleProviderChange}
            onSubmit={handleProviderSubmit}
            onSearchStateChange={setIsChildSearching}
          />
        )}

        {currentStepDef?.id === 'preview' && state.generatedConfig && (
          <PreviewStep
            config={state.generatedConfig}
            files={state.filesToCreate}
            onConfirm={handleConfirm}
            onBack={goToPrevStep}
            existingFiles={existingFiles}
            confirmOverwrite={confirmOverwrite}
            isWriting={isWriting}
          />
        )}
      </Box>

      {/* Footer */}
      {currentStepDef?.id !== 'preview' && (
        <Box marginTop={1}>
          <Text dimColor>
            {canGoBack ? 'Backspace: back | ' : ''}
            q/Esc: exit
          </Text>
        </Box>
      )}

      {/* Completion messages */}
      {completionMessages.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {completionMessages.map((msg, idx) => (
            <Text key={idx} color={msg.startsWith('✅') ? 'green' : undefined}>
              {msg}
            </Text>
          ))}
        </Box>
      )}

      {/* Error display */}
      {state.error && (
        <Box marginTop={1}>
          <Text color="red">Error: {state.error}</Text>
        </Box>
      )}
    </Box>
  );
}
