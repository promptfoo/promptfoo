/**
 * RedteamInitApp - Main application component for the redteam init wizard.
 *
 * This is a specialized version of InitApp that runs the redteam flow directly,
 * used when running `promptfoo redteam init`.
 */

import { useCallback, useEffect, useState } from 'react';

import { useMachine } from '@xstate/react';
import { Box, Text, useApp, useInput } from 'ink';
import { redteamInitMachine } from '../machines/redteamInitMachine';
import { checkExistingFiles, generateFiles, writeFiles } from '../utils';
import { StepIndicator } from './shared/StepIndicator';
import {
  CompleteStep,
  PluginModeStep,
  PluginStep,
  PreviewStep,
  PurposeStep,
  StrategyModeStep,
  StrategyStep,
  TargetLabelStep,
  TargetTypeStep,
  WritingStep,
} from './steps';

import type { PluginSelection, RedteamTargetType, StepInfo } from '../machines/initMachine.types';

export interface RedteamInitAppProps {
  /** Target directory for initialization */
  directory?: string;
  /** Called when initialization is complete */
  onComplete?: (result: { directory: string; filesWritten: string[] }) => void;
  /** Called when user cancels */
  onCancel?: () => void;
}

/**
 * RedteamInitApp component.
 */
export function RedteamInitApp({ directory, onComplete, onCancel }: RedteamInitAppProps) {
  const { exit } = useApp();
  const [state, send] = useMachine(redteamInitMachine);

  // Use directory prop, falling back to state context
  const outputDirectory = directory || state.context.outputDirectory;

  // Local state for file writing progress
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

    if (state.matches('complete')) {
      onComplete?.({
        directory: outputDirectory,
        filesWritten: state.context.filesWritten,
      });
      // Don't auto-exit, let user see the completion screen
    }
  }, [state, exit, onComplete, onCancel, outputDirectory]);

  // Generate preview files when entering preview state
  const handleGeneratePreview = useCallback(async () => {
    // Create a mock InitContext for the generateFiles function
    const mockContext = {
      path: 'new' as const,
      exampleName: null,
      exampleList: [],
      downloadProgress: 0,
      downloadedFiles: [],
      useCase: 'redteam' as const,
      language: null,
      providers: [],
      prompts: [],
      redteam: state.context.redteam,
      outputDirectory: outputDirectory,
      filesToWrite: [],
      filesWritten: [],
      currentStep: 0,
      totalSteps: 6,
      error: null,
    };
    const files = generateFiles(mockContext);
    const checkedFiles = await checkExistingFiles(files);
    send({ type: 'PREVIEW_READY', files: checkedFiles });
  }, [state.context.redteam, outputDirectory, send]);

  // Generate files when entering preview state
  useEffect(() => {
    if (state.matches('previewing') && state.context.filesToWrite.length === 0) {
      void handleGeneratePreview();
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
    const steps: StepInfo[] = [
      { id: 'target', label: 'Target Name', shortLabel: 'Target' },
      { id: 'targetType', label: 'Target Type', shortLabel: 'Type' },
      { id: 'purpose', label: 'Purpose', shortLabel: 'Purpose' },
      { id: 'plugins', label: 'Plugins', shortLabel: 'Plugins' },
      { id: 'strategies', label: 'Strategies', shortLabel: 'Strategies' },
      { id: 'preview', label: 'Preview', shortLabel: 'Preview' },
    ];

    let currentIndex = 0;

    if (state.matches('enteringLabel')) {
      currentIndex = 0;
    } else if (state.matches('selectingTargetType')) {
      currentIndex = 1;
    } else if (state.matches('enteringPurpose')) {
      currentIndex = 2;
    } else if (state.matches('selectingPluginMode') || state.matches('selectingPlugins')) {
      currentIndex = 3;
    } else if (state.matches('selectingStrategyMode') || state.matches('selectingStrategies')) {
      currentIndex = 4;
    } else if (
      state.matches('previewing') ||
      state.matches('writing') ||
      state.matches('complete')
    ) {
      currentIndex = 5;
    }

    return { steps, currentIndex };
  };

  // Render the appropriate step based on machine state
  const renderStep = () => {
    // Target label entry
    if (state.matches('enteringLabel')) {
      return (
        <TargetLabelStep
          value={state.context.redteam.targetLabel}
          onChange={(_value: string) => {
            // Update is handled in onSubmit
          }}
          onSubmit={(label: string) => send({ type: 'SET_TARGET_LABEL', label })}
          onBack={() => send({ type: 'CANCEL' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Target type selection
    if (state.matches('selectingTargetType')) {
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

    // Purpose entry
    if (state.matches('enteringPurpose')) {
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

    // Plugin mode selection
    if (state.matches('selectingPluginMode')) {
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

    // Plugin selection
    if (state.matches('selectingPlugins')) {
      return (
        <PluginStep
          selected={state.context.redteam.plugins}
          onSelect={(plugins: PluginSelection[]) => {
            send({ type: 'SELECT_PLUGINS', plugins });
          }}
          onConfirm={() => send({ type: 'SELECT_PLUGINS', plugins: state.context.redteam.plugins })}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Strategy mode selection
    if (state.matches('selectingStrategyMode')) {
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

    // Strategy selection
    if (state.matches('selectingStrategies')) {
      return (
        <StrategyStep
          selected={state.context.redteam.strategies}
          onSelect={(strategies: string[]) => {
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

    // Preview
    if (state.matches('previewing')) {
      return (
        <PreviewStep
          files={state.context.filesToWrite}
          directory={outputDirectory}
          onToggleOverwrite={handleToggleOverwrite}
          onConfirm={handleWriteFiles}
          onBack={() => send({ type: 'BACK' })}
          onCancel={() => send({ type: 'CANCEL' })}
          isFocused={true}
        />
      );
    }

    // Writing
    if (state.matches('writing')) {
      return <WritingStep files={state.context.filesToWrite} filesWritten={filesWritten} />;
    }

    // Complete
    if (state.matches('complete')) {
      return (
        <CompleteStep
          directory={outputDirectory}
          filesWritten={state.context.filesWritten}
          configPath="promptfooconfig.yaml"
          isRedteam={true}
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
    !state.matches('idle') && !state.matches('cancelled') && !state.matches('complete');

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="red">
          promptfoo redteam init
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
