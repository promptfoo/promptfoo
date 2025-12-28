/**
 * XState machine for the init wizard.
 *
 * This manages the state transitions for the interactive init experience,
 * supporting both example download and new project creation flows.
 */

import { assign, createMachine } from 'xstate';
import { initialRedteamContext } from './initMachine.types';

import type { InitContext, InitEvent, UseCase } from './initMachine.types';

export const initialContext: InitContext = {
  path: null,
  exampleName: null,
  exampleList: [],
  downloadProgress: 0,
  downloadedFiles: [],
  useCase: null,
  language: null,
  providers: [],
  prompts: [],
  redteam: initialRedteamContext,
  outputDirectory: '.',
  filesToWrite: [],
  filesWritten: [],
  currentStep: 0,
  totalSteps: 5,
  error: null,
};

/**
 * Generate prompts based on use case.
 */
function generatePrompts(useCase: UseCase): string[] {
  switch (useCase) {
    case 'compare':
      return ['Write a tweet about {{topic}}', 'Write a concise, funny tweet about {{topic}}'];
    case 'rag':
      return [
        'Write a customer service response to:\n\n{{inquiry}}\n\nUse these documents:\n\n{{context}}',
      ];
    case 'agent':
      return ['Fulfill this user helpdesk ticket: {{inquiry}}'];
    case 'redteam':
      return []; // Redteam has its own prompt handling
    default:
      return [];
  }
}

export const initMachine = createMachine(
  {
    id: 'init',
    initial: 'idle',
    context: initialContext,
    types: {} as {
      context: InitContext;
      events: InitEvent;
    },
    states: {
      idle: {
        on: {
          START: {
            target: 'selectingPath',
            actions: assign({ currentStep: 1 }),
          },
        },
      },

      selectingPath: {
        on: {
          SELECT_PATH: [
            {
              guard: ({ event }) => event.path === 'example',
              target: 'example.selecting',
              actions: assign({
                path: ({ event }) => event.path,
                currentStep: 2,
                totalSteps: 3,
              }),
            },
            {
              target: 'project.selectingUseCase',
              actions: assign({
                path: ({ event }) => event.path,
                currentStep: 2,
              }),
            },
          ],
          CANCEL: 'cancelled',
        },
      },

      example: {
        initial: 'selecting',
        states: {
          selecting: {
            on: {
              SELECT_EXAMPLE: {
                target: 'downloading',
                actions: assign({
                  exampleName: ({ event }) => event.example,
                  outputDirectory: ({ event }) => event.example,
                  currentStep: 3,
                }),
              },
              BACK: {
                target: '#init.selectingPath',
                actions: assign({ currentStep: 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },
          downloading: {
            on: {
              DOWNLOAD_PROGRESS: {
                actions: assign({
                  downloadProgress: ({ event }) => event.progress,
                  downloadedFiles: ({ context, event }) =>
                    event.file ? [...context.downloadedFiles, event.file] : context.downloadedFiles,
                }),
              },
              DOWNLOAD_COMPLETE: {
                target: 'complete',
                actions: assign({
                  filesWritten: ({ event }) => event.files,
                  downloadProgress: 100,
                }),
              },
              DOWNLOAD_ERROR: {
                target: 'error',
                actions: assign({ error: ({ event }) => event.error }),
              },
              CANCEL: '#init.cancelled',
            },
          },
          complete: {
            type: 'final',
          },
          error: {
            on: {
              RETRY: {
                target: 'selecting',
                actions: assign({
                  error: null,
                  downloadProgress: 0,
                  downloadedFiles: [],
                }),
              },
              BACK: {
                target: 'selecting',
                actions: assign({
                  error: null,
                  downloadProgress: 0,
                  downloadedFiles: [],
                  currentStep: 2,
                }),
              },
              CANCEL: '#init.cancelled',
            },
          },
        },
      },

      project: {
        initial: 'selectingUseCase',
        states: {
          selectingUseCase: {
            on: {
              SELECT_USECASE: [
                {
                  guard: ({ event }) => event.useCase === 'compare',
                  target: 'selectingProviders',
                  actions: assign({
                    useCase: ({ event }) => event.useCase,
                    prompts: ({ event }) => generatePrompts(event.useCase),
                    currentStep: 3,
                    totalSteps: 4,
                  }),
                },
                {
                  guard: ({ event }) => event.useCase === 'redteam',
                  target: '#init.redteam.enteringLabel',
                  actions: assign({
                    useCase: ({ event }) => event.useCase,
                    currentStep: 3,
                    totalSteps: 8,
                  }),
                },
                {
                  target: 'selectingLanguage',
                  actions: assign({
                    useCase: ({ event }) => event.useCase,
                    prompts: ({ event }) => generatePrompts(event.useCase),
                    currentStep: 3,
                    totalSteps: 5,
                  }),
                },
              ],
              BACK: {
                target: '#init.selectingPath',
                actions: assign({ currentStep: 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          selectingLanguage: {
            on: {
              SELECT_LANGUAGE: {
                target: 'selectingProviders',
                actions: assign({
                  language: ({ event }) => event.language,
                  currentStep: ({ context }) => context.currentStep + 1,
                }),
              },
              BACK: {
                target: 'selectingUseCase',
                actions: assign({ currentStep: 2 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          selectingProviders: {
            on: {
              SELECT_PROVIDERS: {
                actions: assign({
                  providers: ({ event }) => event.providers,
                }),
              },
              PREVIEW_READY: {
                target: 'previewing',
                actions: assign({
                  filesToWrite: ({ event }) => event.files,
                  currentStep: ({ context }) => context.currentStep + 1,
                }),
              },
              BACK: [
                {
                  guard: ({ context }) => context.useCase === 'compare',
                  target: 'selectingUseCase',
                  actions: assign({ currentStep: 2 }),
                },
                {
                  target: 'selectingLanguage',
                  actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
                },
              ],
              CANCEL: '#init.cancelled',
            },
          },

          previewing: {
            on: {
              TOGGLE_FILE_OVERWRITE: {
                actions: assign({
                  filesToWrite: ({ context, event }) =>
                    context.filesToWrite.map((f) =>
                      f.path === event.path ? { ...f, overwrite: !f.overwrite } : f,
                    ),
                }),
              },
              CONFIRM: 'writing',
              BACK: {
                target: 'selectingProviders',
                actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          writing: {
            on: {
              WRITE_PROGRESS: {
                actions: assign({
                  filesWritten: ({ context, event }) => [...context.filesWritten, event.file],
                }),
              },
              WRITE_COMPLETE: {
                target: 'complete',
                actions: assign({
                  filesWritten: ({ event }) => event.files,
                }),
              },
              WRITE_ERROR: {
                target: 'error',
                actions: assign({ error: ({ event }) => event.error }),
              },
            },
          },

          complete: {
            type: 'final',
          },

          error: {
            on: {
              RETRY: {
                target: 'previewing',
                actions: assign({
                  error: null,
                  filesWritten: [],
                }),
              },
              CANCEL: '#init.cancelled',
            },
          },
        },
      },

      redteam: {
        initial: 'enteringLabel',
        states: {
          enteringLabel: {
            on: {
              SET_TARGET_LABEL: {
                target: 'selectingTargetType',
                actions: assign({
                  redteam: ({ context, event }) => ({
                    ...context.redteam,
                    targetLabel: event.label,
                  }),
                  currentStep: ({ context }) => context.currentStep + 1,
                }),
              },
              BACK: {
                target: '#init.project.selectingUseCase',
                actions: assign({ currentStep: 2 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          selectingTargetType: {
            on: {
              SELECT_TARGET_TYPE: {
                target: 'enteringPurpose',
                actions: assign({
                  redteam: ({ context, event }) => ({
                    ...context.redteam,
                    targetType: event.targetType,
                  }),
                  currentStep: ({ context }) => context.currentStep + 1,
                }),
              },
              BACK: {
                target: 'enteringLabel',
                actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          enteringPurpose: {
            on: {
              SET_PURPOSE: {
                target: 'selectingPluginMode',
                actions: assign({
                  redteam: ({ context, event }) => ({
                    ...context.redteam,
                    purpose: event.purpose,
                  }),
                  currentStep: ({ context }) => context.currentStep + 1,
                }),
              },
              BACK: {
                target: 'selectingTargetType',
                actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          selectingPluginMode: {
            on: {
              SELECT_PLUGIN_CONFIG_MODE: [
                {
                  guard: ({ event }) => event.mode === 'default',
                  target: 'selectingStrategyMode',
                  actions: assign({
                    redteam: ({ context }) => ({
                      ...context.redteam,
                      pluginConfigMode: 'default' as const,
                      // Default plugins will be set by the component
                    }),
                    currentStep: ({ context }) => context.currentStep + 1,
                  }),
                },
                {
                  target: 'selectingPlugins',
                  actions: assign({
                    redteam: ({ context }) => ({
                      ...context.redteam,
                      pluginConfigMode: 'manual' as const,
                    }),
                  }),
                },
              ],
              BACK: {
                target: 'enteringPurpose',
                actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          selectingPlugins: {
            on: {
              SELECT_PLUGINS: {
                target: 'selectingStrategyMode',
                actions: assign({
                  redteam: ({ context, event }) => ({
                    ...context.redteam,
                    plugins: event.plugins,
                  }),
                  currentStep: ({ context }) => context.currentStep + 1,
                }),
              },
              BACK: {
                target: 'selectingPluginMode',
                actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          selectingStrategyMode: {
            on: {
              SELECT_STRATEGY_CONFIG_MODE: [
                {
                  guard: ({ event }) => event.mode === 'default',
                  target: 'previewing',
                  actions: assign({
                    redteam: ({ context }) => ({
                      ...context.redteam,
                      strategyConfigMode: 'default' as const,
                      // Default strategies will be set by the component
                    }),
                    currentStep: ({ context }) => context.currentStep + 1,
                  }),
                },
                {
                  target: 'selectingStrategies',
                  actions: assign({
                    redteam: ({ context }) => ({
                      ...context.redteam,
                      strategyConfigMode: 'manual' as const,
                    }),
                  }),
                },
              ],
              BACK: [
                {
                  guard: ({ context }) => context.redteam.pluginConfigMode === 'manual',
                  target: 'selectingPlugins',
                  actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
                },
                {
                  target: 'selectingPluginMode',
                  actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
                },
              ],
              CANCEL: '#init.cancelled',
            },
          },

          selectingStrategies: {
            on: {
              SELECT_STRATEGIES: {
                target: 'previewing',
                actions: assign({
                  redteam: ({ context, event }) => ({
                    ...context.redteam,
                    strategies: event.strategies,
                  }),
                  currentStep: ({ context }) => context.currentStep + 1,
                }),
              },
              BACK: {
                target: 'selectingStrategyMode',
                actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
              },
              CANCEL: '#init.cancelled',
            },
          },

          previewing: {
            on: {
              TOGGLE_FILE_OVERWRITE: {
                actions: assign({
                  filesToWrite: ({ context, event }) =>
                    context.filesToWrite.map((f) =>
                      f.path === event.path ? { ...f, overwrite: !f.overwrite } : f,
                    ),
                }),
              },
              PREVIEW_READY: {
                actions: assign({
                  filesToWrite: ({ event }) => event.files,
                }),
              },
              CONFIRM: 'writing',
              BACK: [
                {
                  guard: ({ context }) => context.redteam.strategyConfigMode === 'manual',
                  target: 'selectingStrategies',
                  actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
                },
                {
                  target: 'selectingStrategyMode',
                  actions: assign({ currentStep: ({ context }) => context.currentStep - 1 }),
                },
              ],
              CANCEL: '#init.cancelled',
            },
          },

          writing: {
            on: {
              WRITE_PROGRESS: {
                actions: assign({
                  filesWritten: ({ context, event }) => [...context.filesWritten, event.file],
                }),
              },
              WRITE_COMPLETE: {
                target: 'complete',
                actions: assign({
                  filesWritten: ({ event }) => event.files,
                }),
              },
              WRITE_ERROR: {
                target: 'error',
                actions: assign({ error: ({ event }) => event.error }),
              },
            },
          },

          complete: {
            type: 'final',
          },

          error: {
            on: {
              RETRY: {
                target: 'previewing',
                actions: assign({
                  error: null,
                  filesWritten: [],
                }),
              },
              CANCEL: '#init.cancelled',
            },
          },
        },
      },

      cancelled: {
        type: 'final',
      },
    },
  },
  {
    guards: {},
    actions: {},
  },
);

export type InitMachine = typeof initMachine;
