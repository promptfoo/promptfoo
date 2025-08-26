import React, { useEffect, useState } from 'react';

import { useStore } from '@app/stores/evalConfig';
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
import { ErrorBoundary } from 'react-error-boundary';
import ConfigureEnvButton from './ConfigureEnvButton';
import PromptsSection from './PromptsSection';
import ProviderSelector from './ProviderSelector';
import RunTestSuiteButton from './RunTestSuiteButton';
import TestCasesSection from './TestCasesSection';
import YamlEditor from './YamlEditor';
import type { ProviderOptions } from '@promptfoo/types';
import './EvaluateTestSuiteCreator.css';

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

<<<<<<< HEAD
  const { config, updateConfig, reset } = useStore();
=======
  const {
    config,
    updateConfig,
    reset,
    configSource,
    originalResultsConfig,
    isLoading,
    validationStatus,
    restoreOriginal,
    validateCurrentConfig,
  } = useStore();
>>>>>>> 1dc3ab500 (fix(webui): improve edit and re-run functionality with better data handling and UX)
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
    setResetDialogOpen(false);
  };

  return (
    <Container maxWidth="lg" sx={{ marginTop: '2rem' }}>
<<<<<<< HEAD
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h4">Set up an evaluation</Typography>
=======
      {/* Loading State */}
      {isLoading && (
        <Box sx={{ width: '100%', mb: 2 }}>
          <LinearProgress />
        </Box>
      )}

      {/* Config Status */}
      {configSource !== 'fresh' && (
        <Box sx={{ mb: 3 }}>
          <Alert
            severity={validationStatus.hasMinimumFields ? 'success' : 'warning'}
            action={
              originalResultsConfig && (
                <Button color="inherit" size="small" onClick={restoreOriginal} sx={{ mr: 1 }}>
                  Restore Original
                </Button>
              )
            }
          >
            <AlertTitle>
              Configuration loaded from{' '}
              {configSource === 'results' ? 'evaluation results' : 'previous edits'}
            </AlertTitle>
            {configSource === 'results' &&
              'This configuration was automatically created from your evaluation results. You can modify it and run a new evaluation.'}
            {!validationStatus.hasMinimumFields && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="body2" color="warning.main">
                  ⚠️ This configuration may be incomplete. Please review providers and prompts.
                </Typography>
              </Box>
            )}
          </Alert>
        </Box>
      )}

      {/* Validation Errors */}
      {validationStatus.errors.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Alert severity="error">
            <AlertTitle>Configuration Issues</AlertTitle>
            <Stack spacing={1}>
              {validationStatus.errors.map((error, index) => (
                <Typography key={index} variant="body2">
                  • {error}
                </Typography>
              ))}
            </Stack>
          </Alert>
        </Box>
      )}

      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Box>
          <Typography variant="h4">Set up an evaluation</Typography>
          {/* Config source indicator */}
          {configSource !== 'fresh' && (
            <Box sx={{ mt: 1 }}>
              <Chip
                size="small"
                label={configSource === 'results' ? 'From Results' : 'User Edited'}
                color={configSource === 'results' ? 'primary' : 'secondary'}
                variant="outlined"
              />
            </Box>
          )}
        </Box>
>>>>>>> 1dc3ab500 (fix(webui): improve edit and re-run functionality with better data handling and UX)
        <Stack direction="row" spacing={2}>
          <RunTestSuiteButton />
          <ConfigureEnvButton />
          <Button variant="outlined" color="primary" onClick={() => setResetDialogOpen(true)}>
            Reset
          </Button>
        </Stack>
      </Stack>
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
            <Typography variant="h5">Providers</Typography>
            <ProviderSelector
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
      <Box mt={8} />
      <YamlEditor initialConfig={useStore.getState().getTestSuite()} />
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
    </Container>
  );
};

export default EvaluateTestSuiteCreator;
