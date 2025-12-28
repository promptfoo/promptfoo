/**
 * XState machine for the redteam init wizard.
 *
 * This is a specialized version of the init machine that starts directly
 * in the redteam flow, used when running `promptfoo redteam init`.
 */

import { assign, createMachine } from 'xstate';
import { initialRedteamContext } from './initMachine.types';

import type {
  FileToWrite,
  PluginSelection,
  RedteamContext,
  RedteamTargetType,
} from './initMachine.types';

export interface RedteamInitContext {
  /** Redteam-specific context */
  redteam: RedteamContext;

  /** Output directory for generated files */
  outputDirectory: string;

  /** Files to write */
  filesToWrite: FileToWrite[];

  /** Files that have been written */
  filesWritten: string[];

  /** Current step number for progress indicator */
  currentStep: number;

  /** Total number of steps */
  totalSteps: number;

  /** Error message if any */
  error: string | null;
}

export type RedteamInitEvent =
  | { type: 'START' }
  | { type: 'SET_TARGET_LABEL'; label: string }
  | { type: 'SELECT_TARGET_TYPE'; targetType: RedteamTargetType }
  | { type: 'SET_PURPOSE'; purpose: string }
  | { type: 'SELECT_PLUGIN_CONFIG_MODE'; mode: 'default' | 'manual' }
  | { type: 'SELECT_PLUGINS'; plugins: PluginSelection[] }
  | { type: 'SELECT_STRATEGY_CONFIG_MODE'; mode: 'default' | 'manual' }
  | { type: 'SELECT_STRATEGIES'; strategies: string[] }
  | { type: 'PREVIEW_READY'; files: FileToWrite[] }
  | { type: 'TOGGLE_FILE_OVERWRITE'; path: string }
  | { type: 'CONFIRM' }
  | { type: 'WRITE_PROGRESS'; file: string }
  | { type: 'WRITE_COMPLETE'; files: string[] }
  | { type: 'WRITE_ERROR'; error: string }
  | { type: 'BACK' }
  | { type: 'CANCEL' }
  | { type: 'RETRY' };

export const initialRedteamInitContext: RedteamInitContext = {
  redteam: initialRedteamContext,
  outputDirectory: '.',
  filesToWrite: [],
  filesWritten: [],
  currentStep: 1,
  totalSteps: 6,
  error: null,
};

export const redteamInitMachine = createMachine(
  {
    id: 'redteamInit',
    initial: 'idle',
    context: initialRedteamInitContext,
    types: {} as {
      context: RedteamInitContext;
      events: RedteamInitEvent;
    },
    states: {
      idle: {
        on: {
          START: {
            target: 'enteringLabel',
            actions: assign({ currentStep: 1 }),
          },
        },
      },

      enteringLabel: {
        on: {
          SET_TARGET_LABEL: {
            target: 'selectingTargetType',
            actions: assign({
              redteam: ({ context, event }) => ({
                ...context.redteam,
                targetLabel: event.label,
              }),
              currentStep: 2,
            }),
          },
          CANCEL: 'cancelled',
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
              currentStep: 3,
            }),
          },
          BACK: {
            target: 'enteringLabel',
            actions: assign({ currentStep: 1 }),
          },
          CANCEL: 'cancelled',
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
              currentStep: 4,
            }),
          },
          BACK: {
            target: 'selectingTargetType',
            actions: assign({ currentStep: 2 }),
          },
          CANCEL: 'cancelled',
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
                }),
                currentStep: 5,
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
            actions: assign({ currentStep: 3 }),
          },
          CANCEL: 'cancelled',
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
              currentStep: 5,
            }),
          },
          BACK: {
            target: 'selectingPluginMode',
            actions: assign({ currentStep: 4 }),
          },
          CANCEL: 'cancelled',
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
                }),
                currentStep: 6,
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
              actions: assign({ currentStep: 4 }),
            },
            {
              target: 'selectingPluginMode',
              actions: assign({ currentStep: 4 }),
            },
          ],
          CANCEL: 'cancelled',
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
              currentStep: 6,
            }),
          },
          BACK: {
            target: 'selectingStrategyMode',
            actions: assign({ currentStep: 5 }),
          },
          CANCEL: 'cancelled',
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
              actions: assign({ currentStep: 5 }),
            },
            {
              target: 'selectingStrategyMode',
              actions: assign({ currentStep: 5 }),
            },
          ],
          CANCEL: 'cancelled',
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
          CANCEL: 'cancelled',
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

export type RedteamInitMachine = typeof redteamInitMachine;
