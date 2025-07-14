import React, { useState, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useStore } from '@app/stores/evalConfig';
import { useHistoryStore } from '@app/stores/evalConfigWithHistory';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { ProviderOptions } from '@promptfoo/types';
import ConfigureEnvButton from './ConfigureEnvButton';
import PromptsSection from './PromptsSection';
import SimplifiedProviderSelector from './SimplifiedProviderSelector';
import RunTestSuiteButton from './RunTestSuiteButton';
import TestCasesSection from './TestCasesSection';
import YamlEditor from './YamlEditor';
import { WorkflowHelp, ProvidersHelp, EvaluationHelp } from './HelpText';
import { OnboardingDialog } from './OnboardingDialog';
import NextStepsGuide from './NextStepsGuide';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { SavedDataManager } from './SavedDataManager';
import { UndoRedoButtons } from './UndoRedoButtons';
import { SessionRecoveryNotification } from './SessionRecoveryNotification';
import FloatingRunButton from './FloatingRunButton';
import ConfigProgressIndicator from './ConfigProgressIndicator';
import TemplateSelector from './TemplateSelector';
import ImprovedHeader from './ImprovedHeader';
import IntegratedRunButton from './IntegratedRunButton';
import { useHistoryInitialization } from '../hooks/useHistoryInitialization';
import { useUnsavedChangesWarning } from '../hooks/useUnsavedChangesWarning';
import './EvaluateTestSuiteCreator.css';
import './EvaluateTestSuiteCreator.responsive.css';

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

const EvaluateTestSuiteCreator: React.FC = () => {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  const { config, updateConfig, reset } = useStore();
  const { providers = [], prompts = [], tests = [] } = config;

  // Initialize history tracking
  useHistoryInitialization();

  // Warn about unsaved changes
  useUnsavedChangesWarning();

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

  const handleReset = () => {
    reset();
    useHistoryStore.getState().clearHistory();
    setResetDialogOpen(false);
  };

  // Check if this is the user's first visit
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('promptfoo-eval-creator-onboarded');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('promptfoo-eval-creator-onboarded', 'true');
    setShowOnboarding(false);
  };

  // Validation for run button
  const validation = React.useMemo(() => {
    const errors: string[] = [];
    if (!prompts || prompts.length === 0) {
      errors.push('At least one prompt is required');
    }
    if (!providers || providers.length === 0) {
      errors.push('At least one provider is required');
    }
    if (!tests || tests.length === 0) {
      errors.push('At least one test case is required');
    }
    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [prompts, providers, tests]);

  return (
    <>
      {/* Hidden ConfigureEnvButton for functionality */}
      <Box sx={{ display: 'none' }}>
        <ConfigureEnvButton />
      </Box>

      <ImprovedHeader
        runButton={<IntegratedRunButton disabled={!validation.isValid} />}
        onTemplates={() => setShowTemplateSelector(true)}
        onTutorial={() => setShowOnboarding(true)}
        onReset={() => setResetDialogOpen(true)}
        onConfigureEnv={() => {
          // Find and click the hidden ConfigureEnvButton
          const envButtons = document.querySelectorAll('button');
          const envButton = Array.from(envButtons).find(
            (btn) =>
              btn.textContent?.includes('Configure') ||
              btn.getAttribute('aria-label')?.includes('environment'),
          );
          if (envButton) {
            envButton.click();
          }
        }}
        canUndo={useHistoryStore.getState().canUndo}
        canRedo={useHistoryStore.getState().canRedo}
        onUndo={useHistoryStore.getState().undo}
        onRedo={useHistoryStore.getState().redo}
        autoSaveComponent={<AutoSaveIndicator />}
        savedDataComponent={<SavedDataManager />}
      />

      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <ConfigProgressIndicator />

        <Box mt={3}>
          <WorkflowHelp />
        </Box>
        {/* Show general guidance when starting */}
        {prompts.length === 0 && providers.length === 0 && tests.length === 0 && (
          <Box mt={2}>
            <NextStepsGuide onOpenTemplates={() => setShowTemplateSelector(true)} />
          </Box>
        )}

        <Box mt={4} />
        {/*
      <Box mt={4}>
        <TextField
          label="Description"
          value={description}
          onChange={(e) => {
            updateConfig({ description: e.target.value });
          }}
          fullWidth
          margin="normal"
        />
      </Box>
      */}
        <Box mt={2}>
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={() => {
              updateConfig({ providers: [] });
            }}
          >
            <Stack direction="column" spacing={2} justifyContent="space-between">
              <ProvidersHelp />
              <Typography variant="h5">Providers</Typography>
              <SimplifiedProviderSelector
                providers={normalizedProviders}
                onChange={(p) => updateConfig({ providers: p })}
              />
            </Stack>
          </ErrorBoundary>
        </Box>
        <Box mt={4} />
        <ErrorBoundary
          FallbackComponent={ErrorFallback}
          onReset={() => {
            updateConfig({ prompts: [] });
          }}
        >
          <PromptsSection />
        </ErrorBoundary>
        <Box mt={6} />
        <ErrorBoundary
          FallbackComponent={ErrorFallback}
          onReset={() => {
            updateConfig({ tests: [] });
          }}
        >
          <TestCasesSection varsList={varsList} />
        </ErrorBoundary>

        <Box mt={6}>
          <EvaluationHelp />
        </Box>

        <Box mt={8} />
        <YamlEditor initialConfig={useStore.getState().getTestSuite()} />
      </Container>

      <Dialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{'Confirm Reset'}</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to reset all the fields? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleReset} autoFocus>
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      <OnboardingDialog
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={handleOnboardingComplete}
      />
      <TemplateSelector
        open={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
      />

      <SessionRecoveryNotification />

      <FloatingRunButton />
    </>
  );
};

export default EvaluateTestSuiteCreator;
