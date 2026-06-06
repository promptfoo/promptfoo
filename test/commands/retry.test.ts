import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import {
  deleteErrorResults as commandDeleteErrorResults,
  getErrorResultIds as commandGetErrorResultIds,
  recalculatePromptMetrics as commandRecalculatePromptMetrics,
  retryCommand as commandRetryCommand,
  setupRetryCommand,
} from '../../src/commands/retry';
import {
  deleteErrorResults,
  getErrorResultIds,
  recalculatePromptMetrics,
  retryCommand,
} from '../../src/node/retry';

describe('setupRetryCommand', () => {
  it('preserves the established command-module runtime exports', () => {
    expect(commandDeleteErrorResults).toBe(deleteErrorResults);
    expect(commandGetErrorResultIds).toBe(getErrorResultIds);
    expect(commandRecalculatePromptMetrics).toBe(recalculatePromptMetrics);
    expect(commandRetryCommand).toBe(retryCommand);
  });

  it('registers retry as a CLI command', () => {
    const program = new Command();

    setupRetryCommand(program);

    const retry = program.commands.find((command) => command.name() === 'retry');
    expect(retry).toBeDefined();
    expect(retry?.description()).toBe('Retry all ERROR results from a given evaluation');
    expect(retry?.options.map((option) => option.long)).toEqual([
      '--config',
      '--verbose',
      '--max-concurrency',
      '--delay',
      '--share',
      '--no-share',
    ]);
  });
});
