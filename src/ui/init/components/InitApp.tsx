/**
 * InitApp - Main application component for the init wizard.
 *
 * Orchestrates the wizard flow by connecting the XState machine
 * to the step components.
 */

import { useCallback, useEffect, useState } from 'react';

import { useMachine } from '@xstate/react';
import { Box, Text, useApp, useInput } from 'ink';
import { initMachine } from '../machines/initMachine';
import {
  checkExistingFiles,
  downloadExample,
  fetchExampleList,
  generateFiles,
  normalizeDirectory,
  writeFiles,
} from '../utils';
import { StepIndicator } from './shared/StepIndicator';
import {
  CompleteStep,
  DownloadComplete as DownloadCompleteComponent,
  DownloadProgress as DownloadProgressComponent,
  ExampleStep,
  LanguageStep,
  PathStep,
  PluginModeStep,
  PluginStep,
  PreviewStep,
  ProviderStep,
  PurposeStep,
  StrategyModeStep,
  StrategyStep,
  // Redteam step components
  TargetLabelStep,
  TargetTypeStep,
  UseCaseStep,
  WritingStep,
} from './steps';

import type {
  InitPath,
  Language,
  PluginSelection,
  RedteamTargetType,
  SelectedProvider,
  StepInfo,
  UseCase,
} from '../machines/initMachine.types';
import type { DownloadProgress } from '../utils';

export interface InitAppProps {
  /** Called when initialization is complete */
  onComplete?: (result: { directory: string; filesWritten: string[] }) => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

/**
 * Main InitApp component.
 */
export function InitApp({ onComplete, onCancel }: InitAppProps) {
  const { exit } = useApp();
  const [state, send] = useMachine(initMachine);

  // Local state for async operations
  const [examplesLoading, setExamplesLoading] = useState(false);
  const [examplesError, setExamplesError] = useState<string | null>(null);
  const [exampleList, setExampleList] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [filesWritten, setFilesWritten] = useState<string[]>([]);

  // Handle global keyboard shortcuts
  useInput((input, key) => {
    // Ctrl+C to cancel
    if (input === 'c' && key.ctrl) {
      send({ type: 'CANCEL' });
    }
  });

  // Handle machine state changes
  useEffect(() => {
    // Handle final states
    if (state.matches('cancelled')) {
      onCancel?.();
      exit();
    }

    if (state.matches('project.complete')) {
      onComplete?.({
        directory: state.context.outputDirectory,
        filesWritten: state.context.filesWritten,
      });
      // Don't auto-exit, let user press any key
    }

    if (state.matches('example.complete')) {
      onComplete?.({
        directory: state.context.outputDirectory,
        filesWritten: state.context.filesWritten,
      });
    }

    if (state.matches('redteam.complete')) {
      onComplete?.({
        directory: state.context.outputDirectory,
        filesWritten: state.context.filesWritten,
      });
    }
  }, [state, exit, onComplete, onCancel]);

  // Load examples when entering example selection
  useEffect(() => {
    if (state.matches('example.selecting') && exampleList.length === 0 && !examplesLoading) {
      setExamplesLoading(true);
      setExamplesError(null);

      fetchExampleList()
        .then((examples) => {
          setExampleList(examples);
          setExamplesLoading(false);
        })
        .catch((error) => {
          setExamplesError(error instanceof Error ? error.message : String(error));
          setExamplesLoading(false);
        });
    }
  }, [state, exampleList.length, examplesLoading]);

  // Handle example download
  const handleDownloadExample = useCallback(
    async (exampleName: string) => {
      const targetDir = normalizeDirectory(state.context.outputDirectory || exampleName);

      send({ type: 'SELECT_EXAMPLE', example: exampleName });

      const result = await downloadExample(exampleName, targetDir, (progress) => {
        setDownloadProgress(progress);
      });

      if (result.success) {
        send({ type: 'DOWNLOAD_COMPLETE', files: result.filesDownloaded });
      } else {
        send({
          type: 'DOWNLOAD_ERROR',
          error: result.errors.map((e) => e.error).join(', '),
        });
      }
    },
    [state.context.outputDirectory, send],
  );

  // Handle file preview generation
  const handleGeneratePreview = useCallback(async () => {
    const files = generateFiles(state.context);
    const checkedFiles = await checkExistingFiles(files);
    send({ type: 'PREVIEW_READY', files: checkedFiles });
  }, [state.context, send]);

  // Generate preview files when entering redteam preview state
  useEffect(() => {
    if (state.matches('redteam.previewing') && state.context.filesToWrite.length === 0) {
      handleGeneratePreview();
    }
  }, [state, handleGeneratePreview]);

  // Handle file writing
  const handleWriteFiles = useCallback(async () => {
    send({ type: 'CONFIRM' });

    const result = await writeFiles(state.context.filesToWrite, {
      onFileWritten: (path) => {
        setFilesWritten((prev) => [...prev, path]);
      },
    });

    if (result.success) {
      send({ type: 'WRITE_COMPLETE', files: result.filesWritten });
    } else {
      send({
        type: 'WRITE_ERROR',
        error: result.errors.map((e) => e.error).join(', '),
      });
    }
  }, [state.context.filesToWrite, send]);

  // Toggle file overwrite
  const handleToggleOverwrite = useCallback(
    (path: string) => {
      send({ type: 'TOGGLE_FILE_OVERWRITE', path });
    },
    [send],
  );

  // Get current step info for the step indicator
  const getStepInfo = (): { steps: StepInfo[]; currentIndex: number } => {
    if (state.matches('example')) {
      const exampleSteps: StepInfo[] = [
        { id: 'example', label: 'Select example', shortLabel: 'Example' },
        { id: 'download', label: 'Download', shortLabel: 'Download' },
      ];
      return {
        steps: exampleSteps,
        currentIndex: state.matches('example.selecting') ? 0 : 1,
      };
    }

    // Redteam flow steps
    if (state.context.useCase === 'redteam' || state.matches('redteam')) {
      const redteamSteps: StepInfo[] = [
        { id: 'target', label: 'Target Name', shortLabel: 'Target' },
        { id: 'targetType', label: 'Target Type', shortLabel: 'Type' },
        { id: 'purpose', label: 'Purpose', shortLabel: 'Purpose' },
        { id: 'plugins', label: 'Plugins', shortLabel: 'Plugins' },
        { id: 'strategies', label: 'Strategies', shortLabel: 'Strategies' },
        { id: 'preview', label: 'Preview', shortLabel: 'Preview' },
      ];

      let currentIndex = 0;

      if (state.matches('redteam.enteringLabel')) {
        currentIndex = 0;
      } else if (state.matches('redteam.selectingTargetType')) {
        currentIndex = 1;
      } else if (state.matches('redteam.enteringPurpose')) {
        currentIndex = 2;
      } else if (
        state.matches('redteam.selectingPluginMode') ||
        state.matches('redteam.selectingPlugins')
      ) {
        currentIndex = 3;
      } else if (
        state.matches('redteam.selectingStrategyMode') ||
        state.matches('redteam.selectingStrategies')
      ) {
        currentIndex = 4;
      } else if (
        state.matches('redteam.previewing') ||
        state.matches('redteam.writing') ||
        state.matches('redteam.complete')
      ) {
        currentIndex = 5;
      }

      return {
        steps: redteamSteps,
        currentIndex,
      };
    }

    // Project flow steps
    const needsLanguage = state.context.useCase === 'rag' || state.context.useCase === 'agent';

    const projectSteps: StepInfo[] = [{ id: 'useCase', label: 'Use Case', shortLabel: 'Use Case' }];

    if (needsLanguage) {
      projectSteps.push({ id: 'language', label: 'Language', shortLabel: 'Language' });
    }

    projectSteps.push(
      { id: 'providers', label: 'Providers', shortLabel: 'Providers' },
      { id: 'preview', label: 'Preview', shortLabel: 'Preview' },
      { id: 'write', label: 'Write', shortLabel: 'Write' },
    );

    let currentIndex = 0;

    if (state.matches('project.selectingUseCase')) {
      currentIndex = 0;
    } else if (state.matches('project.selectingLanguage')) {
      currentIndex = 1;
    } else if (state.matches('project.selectingProviders')) {
      currentIndex = needsLanguage ? 2 : 1;
    } else if (state.matches('project.previewing')) {
      currentIndex = needsLanguage ? 3 : 2;
    } else if (state.matches('project.writing') || state.matches('project.complete')) {
      currentIndex = needsLanguage ? 4 : 3;
    }

    return {
      steps: projectSteps,
      currentIndex,
    };
  };

  // Render the appropriate step based on machine state
  const renderStep = () => {
    // Path selection
    if (state.matches('selectingPath')) {
      return (
        <PathStep
          onSelect={(path: InitPath) => send({ type: 'SELECT_PATH', path })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Example flow
    if (state.matches('example.selecting')) {
      return (
        <ExampleStep
          examples={exampleList}
          isLoading={examplesLoading}
          error={examplesError}
          onSelect={handleDownloadExample}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          onRetry={() => {
            setExamplesLoading(true);
            setExamplesError(null);
            fetchExampleList()
              .then((examples) => {
                setExampleList(examples);
                setExamplesLoading(false);
              })
              .catch((error) => {
                setExamplesError(error instanceof Error ? error.message : String(error));
                setExamplesLoading(false);
              });
          }}
          isFocused={true}
        />
      );
    }

    if (state.matches('example.downloading') && downloadProgress) {
      return (
        <DownloadProgressComponent
          exampleName={state.context.exampleName || ''}
          progress={downloadProgress.percentage}
          downloadedFiles={state.context.filesWritten}
        />
      );
    }

    if (state.matches('example.complete')) {
      return (
        <DownloadCompleteComponent
          exampleName={state.context.exampleName || ''}
          directory={state.context.outputDirectory}
          filesCount={state.context.filesWritten.length}
        />
      );
    }

    // Project flow - Use case selection
    if (state.matches('project.selectingUseCase')) {
      return (
        <UseCaseStep
          onSelect={(useCase: UseCase) => send({ type: 'SELECT_USECASE', useCase })}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Project flow - Language selection
    if (state.matches('project.selectingLanguage')) {
      return (
        <LanguageStep
          onSelect={(language: Language) => send({ type: 'SELECT_LANGUAGE', language })}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Project flow - Provider selection
    if (state.matches('project.selectingProviders')) {
      return (
        <ProviderStep
          selected={state.context.providers}
          onSelect={(providers: SelectedProvider[]) => {
            // Update context with new provider selection
            send({ type: 'SELECT_PROVIDERS', providers });
          }}
          onConfirm={handleGeneratePreview}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Project flow - Preview
    if (state.matches('project.previewing')) {
      return (
        <PreviewStep
          files={state.context.filesToWrite}
          directory={state.context.outputDirectory}
          onToggleOverwrite={handleToggleOverwrite}
          onConfirm={handleWriteFiles}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Project flow - Writing
    if (state.matches('project.writing')) {
      return <WritingStep files={state.context.filesToWrite} filesWritten={filesWritten} />;
    }

    // Project flow - Complete
    if (state.matches('project.complete')) {
      return (
        <CompleteStep
          directory={state.context.outputDirectory}
          filesWritten={state.context.filesWritten}
          configPath="promptfooconfig.yaml"
        />
      );
    }

    // Redteam flow - Target label entry
    if (state.matches('redteam.enteringLabel')) {
      return (
        <TargetLabelStep
          value={state.context.redteam.targetLabel}
          onChange={(_value: string) => {
            // Update is handled in onSubmit
          }}
          onSubmit={(label: string) => send({ type: 'SET_TARGET_LABEL', label })}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Target type selection
    if (state.matches('redteam.selectingTargetType')) {
      return (
        <TargetTypeStep
          onSelect={(targetType: RedteamTargetType) =>
            send({ type: 'SELECT_TARGET_TYPE', targetType })
          }
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Purpose entry
    if (state.matches('redteam.enteringPurpose')) {
      return (
        <PurposeStep
          value={state.context.redteam.purpose}
          onChange={(_value: string) => {
            // Update is handled in onSubmit
          }}
          onSubmit={(purpose: string) => send({ type: 'SET_PURPOSE', purpose })}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Plugin mode selection
    if (state.matches('redteam.selectingPluginMode')) {
      return (
        <PluginModeStep
          onSelect={(mode: 'default' | 'manual') =>
            send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode })
          }
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Plugin selection
    if (state.matches('redteam.selectingPlugins')) {
      return (
        <PluginStep
          selected={state.context.redteam.plugins}
          onSelect={(plugins: PluginSelection[]) => {
            // Update context locally, will be committed on confirm
            send({ type: 'SELECT_PLUGINS', plugins });
          }}
          onConfirm={() => send({ type: 'SELECT_PLUGINS', plugins: state.context.redteam.plugins })}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Strategy mode selection
    if (state.matches('redteam.selectingStrategyMode')) {
      return (
        <StrategyModeStep
          onSelect={(mode: 'default' | 'manual') =>
            send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode })
          }
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Strategy selection
    if (state.matches('redteam.selectingStrategies')) {
      return (
        <StrategyStep
          selected={state.context.redteam.strategies}
          onSelect={(strategies: string[]) => {
            // Update context locally, will be committed on confirm
            send({ type: 'SELECT_STRATEGIES', strategies });
          }}
          onConfirm={() =>
            send({ type: 'SELECT_STRATEGIES', strategies: state.context.redteam.strategies })
          }
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Preview
    if (state.matches('redteam.previewing')) {
      return (
        <PreviewStep
          files={state.context.filesToWrite}
          directory={state.context.outputDirectory}
          onToggleOverwrite={handleToggleOverwrite}
          onConfirm={handleWriteFiles}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Redteam flow - Writing
    if (state.matches('redteam.writing')) {
      return <WritingStep files={state.context.filesToWrite} filesWritten={filesWritten} />;
    }

    // Redteam flow - Complete
    if (state.matches('redteam.complete')) {
      return (
        <CompleteStep
          directory={state.context.outputDirectory}
          filesWritten={state.context.filesWritten}
          configPath="promptfooconfig.yaml"
        />
      );
    }

    // Error state
    if (state.context.error) {
      return (
        <Box flexDirection="column">
          <Text color="red" bold>
            Error
          </Text>
          <Text color="red">{state.context.error}</Text>
          <Box marginTop={1}>
            <Text dimColor>Press any key to exit</Text>
          </Box>
        </Box>
      );
    }

    // Initial/loading state
    return (
      <Box>
        <Text color="cyan">Initializing...</Text>
      </Box>
    );
  };

  // Auto-start the machine
  useEffect(() => {
    if (state.matches('idle')) {
      send({ type: 'START' });
    }
  }, [state, send]);

  const stepInfo = getStepInfo();
  const showStepIndicator =
    !state.matches('idle') &&
    !state.matches('selectingPath') &&
    !state.matches('cancelled') &&
    !state.matches('project.complete') &&
    !state.matches('example.complete') &&
    !state.matches('redteam.complete');

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          promptfoo init
        </Text>
      </Box>

      {/* Step indicator */}
      {showStepIndicator && (
        <Box marginBottom={1}>
          <StepIndicator
            steps={stepInfo.steps}
            currentIndex={stepInfo.currentIndex}
            compact={true}
          />
        </Box>
      )}

      {/* Current step content */}
      {renderStep()}
    </Box>
  );
}
