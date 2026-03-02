/**
 * Ink-based interactive init wizard.
 *
 * This module provides a modern, interactive CLI experience for
 * initializing promptfoo projects.
 */

export { runInkInit, shouldUseInkInit } from './initRunner';

export type {
  InitContext,
  InitEvent,
  InitPath,
  Language,
  UseCase,
} from './machines/initMachine.types';
