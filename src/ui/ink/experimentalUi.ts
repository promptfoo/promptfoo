import * as React from 'react';

import globalMessageHandler from '../../util/globalMessageHandler';
import { getInk, renderInk } from '../../util/ink';
import type { InkExports } from '../../util/ink';
import type { CommandLineOptions, EvaluateOptions, UnifiedConfig } from '../../types/index';
import type { Command } from 'commander';
import type { QueuedMessage } from '../../util/globalMessageHandler';
import type { RunEvalOptions } from '../../types/index';
import type Eval from '../../models/eval';

import ExperimentalEvalUiController, {
  type ExperimentalUiCompletion,
  type ExperimentalUiProgress,
} from './controller';
import { buildProgressBar, formatTime, summarizeEvalStep, truncateText } from './helpers';

type DoEvalFn = (
  cmdObj: Partial<CommandLineOptions & Command>,
  defaultConfig: Partial<UnifiedConfig>,
  defaultConfigPath: string | undefined,
  evaluateOptions: EvaluateOptions,
  uiHooks?: ExperimentalUiHooks,
) => Promise<Eval>;

export type ExperimentalUiHooks = {
  onBeforeEvaluate?: () => void;
  onEvaluateComplete?: () => void;
  onEvaluateError?: (error: unknown) => void;
};

type RunExperimentalUiParams = {
  cmdObj: Partial<CommandLineOptions & Command>;
  defaultConfig: Partial<UnifiedConfig>;
  defaultConfigPath: string | undefined;
  evaluateOptions: EvaluateOptions;
  doEval: DoEvalFn;
};

export async function runEvalWithExperimentalInkUi({
  cmdObj,
  defaultConfig,
  defaultConfigPath,
  evaluateOptions,
  doEval,
}: RunExperimentalUiParams): Promise<Eval> {
  const controller = new ExperimentalEvalUiController();
  controller.setStatus('Setting up evaluation...');

  globalMessageHandler.startQueueing(['error']);
  const unsubscribeHandler = globalMessageHandler.subscribe((state) => {
    controller.updateErrorState(state);
  });

  const ink = await getInk();
  const ExperimentalComponent = createExperimentalEvalComponent(ink, controller);
  const inkInstance = await renderInk(React.createElement(ExperimentalComponent), {
    exitOnCtrlC: true,
  });

  const originalProgressCallback = evaluateOptions.progressCallback;
  let hasSeenProgress = false;

  const patchedEvaluateOptions: EvaluateOptions = {
    ...evaluateOptions,
    showProgressBar: false,
    progressCallback: (completed, total, index, evalStep, metrics) => {
      if (!hasSeenProgress) {
        controller.setStatus('Running evaluation...');
        hasSeenProgress = true;
      }

      if (originalProgressCallback) {
        originalProgressCallback(completed, total, index, evalStep, metrics);
      }

      const { provider, promptLabel, testLabel } = summarizeEvalStep(evalStep as RunEvalOptions);
      controller.updateProgress({
        completed,
        total,
        provider,
        promptLabel,
        testLabel,
      });
    },
  };

  const uiHooks: ExperimentalUiHooks = {
    onBeforeEvaluate: () => {
      controller.setStatus('Starting evaluation...');
    },
    onEvaluateComplete: () => {
      controller.setStatus('Evaluation complete');
      controller.complete({ status: 'success' });
    },
    onEvaluateError: (error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      controller.setStatus('Evaluation failed');
      controller.complete({ status: 'error', error: err });
    },
  };

  try {
    const result = await doEval(
      cmdObj,
      defaultConfig,
      defaultConfigPath,
      patchedEvaluateOptions,
      uiHooks,
    );
    await controller.waitForCompletion();
    if (inkInstance?.waitUntilExit) {
      await inkInstance.waitUntilExit();
    }
    return result;
  } catch (error) {
    if (!controller.hasCompleted()) {
      const err = error instanceof Error ? error : new Error(String(error));
      controller.complete({ status: 'error', error: err });
    }
    await controller.waitForCompletion();
    if (inkInstance?.waitUntilExit) {
      await inkInstance.waitUntilExit();
    }
    throw error;
  } finally {
    unsubscribeHandler();
    globalMessageHandler.stopQueueing();
  }
}

function createExperimentalEvalComponent(
  ink: InkExports,
  controller: ExperimentalEvalUiController,
) {
  const { Box, Text, useApp, useInput } = ink;

  return function ExperimentalEvalUI() {
    const { exit } = useApp();
    const [progress, setProgress] = React.useState<ExperimentalUiProgress>({
      completed: 0,
      total: 0,
      errorCount: 0,
    });
    const [errors, setErrors] = React.useState<QueuedMessage[]>([]);
    const [status, setStatus] = React.useState<string>('Preparing evaluation...');
    const [completion, setCompletion] = React.useState<ExperimentalUiCompletion | null>(null);

    React.useEffect(() => {
      const subscriptions = [
        controller.onProgress((update) => {
          setProgress(update);
        }),
        controller.onError((entry) => {
          setErrors((prev) => {
            const next = [...prev, entry];
            return next.slice(-8);
          });
        }),
        controller.onStatus((value) => {
          setStatus(value);
        }),
        controller.onComplete((payload) => {
          setCompletion(payload);
          setStatus(payload.status === 'success' ? 'Evaluation complete' : 'Evaluation failed');
          setTimeout(() => exit(), 300);
        }),
      ];

      return () => {
        subscriptions.forEach((unsubscribe) => unsubscribe());
      };
    }, [controller, exit]);

    useInput((input, key) => {
      if ((input && input.toLowerCase() === 'q') || key.escape) {
        exit();
      }
    });

    const percent =
      progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    const progressBar = buildProgressBar(progress.completed, progress.total);

    const errorElements = errors.length
      ? errors.map((entry, index) =>
          React.createElement(
            Text,
            { key: `${entry.timestamp.getTime()}-${index}`, color: 'red' },
            `[${formatTime(entry.timestamp)}] ${entry.message}`,
          ),
        )
      : [React.createElement(Text, { key: 'empty', dimColor: true }, 'No errors recorded yet.')];

    return React.createElement(
      Box,
      { flexDirection: 'column' },
      React.createElement(
        Box,
        {
          flexDirection: 'column',
          borderStyle: 'round',
          borderColor: completion?.status === 'error' ? 'red' : 'cyan',
          paddingX: 1,
          paddingY: 1,
          width: 72,
        },
        React.createElement(Text, { color: 'green', bold: true }, 'promptfoo experimental UI'),
        React.createElement(Text, null, status),
        React.createElement(
          Text,
          { dimColor: true },
          completion
            ? 'Press Q or Esc to close.'
            : 'Press Q or Esc to exit early (evaluation continues in background).',
        ),
        React.createElement(
          Box,
          { marginTop: 1, flexDirection: 'column' },
          React.createElement(
            Text,
            null,
            `${progressBar} ${percent}% (${progress.completed}/${progress.total})`,
          ),
          progress.provider
            ? React.createElement(
                Text,
                { dimColor: true },
                `Provider: ${truncateText(progress.provider, 50)}`,
              )
            : React.createElement(Text, { dimColor: true }, 'Waiting for first provider...'),
          progress.promptLabel
            ? React.createElement(
                Text,
                { dimColor: true },
                `Prompt: ${truncateText(progress.promptLabel, 50)}`,
              )
            : null,
          progress.testLabel
            ? React.createElement(
                Text,
                { dimColor: true },
                `Test: ${truncateText(progress.testLabel, 50)}`,
              )
            : null,
          React.createElement(Text, { dimColor: true }, `Errors: ${progress.errorCount}`),
        ),
        completion?.status === 'error' && completion.error
          ? React.createElement(
              Box,
              { marginTop: 1 },
              React.createElement(
                Text,
                { color: 'red' },
                `Fatal error: ${completion.error.message}`,
              ),
            )
          : null,
      ),
      React.createElement(
        Box,
        {
          marginTop: 1,
          flexDirection: 'column',
          borderStyle: 'round',
          borderColor: errors.length > 0 ? 'red' : 'gray',
          paddingX: 1,
          paddingY: 1,
          width: 72,
        },
        React.createElement(
          Text,
          { color: errors.length > 0 ? 'red' : 'gray', bold: true },
          `Recent errors (${errors.length})`,
        ),
        ...errorElements,
      ),
    );
  };
}
