import { describe, expect, it } from 'vitest';
import {
  buildCodexExecutionHealth,
  buildCodexProviderError,
  buildCodexSandboxFailure,
} from '../../src/providers/openai/codexExecutionHealth';

describe('codexExecutionHealth', () => {
  it('records command exit codes without classifying command prose', () => {
    const health = buildCodexExecutionHealth({
      eventCoverage: 'stream',
      items: [
        {
          id: 'ok',
          type: 'command_execution',
          status: 'completed',
          exit_code: 0,
          aggregated_output: 'fixture: 429 Could not resolve host ECONNREFUSED bwrap Landlock',
        },
        {
          id: 'failed',
          type: 'command_execution',
          status: 'failed',
          exit_code: 2,
          aggregated_output: 'source text includes Could not resolve host',
        },
      ],
    });

    expect(health.toolExitCodes).toEqual([
      { itemId: 'ok', status: 'completed', exitCode: 0 },
      { itemId: 'failed', status: 'failed', exitCode: 2 },
    ]);
    expect(health.providerErrors).toEqual([]);
    expect(health.sandboxFailures).toEqual([]);
  });

  it('preserves structured provider errors and sandbox discriminators', () => {
    const error = {
      message: 'sandbox initialization failed',
      code: 'sandbox_error',
      codexErrorInfo: { type: 'SandboxError' },
    };

    expect(buildCodexProviderError(error, { source: 'turn', fatal: true })).toEqual({
      source: 'turn',
      message: 'sandbox initialization failed',
      code: 'sandbox_error',
      kind: 'SandboxError',
      fatal: true,
    });
    expect(buildCodexSandboxFailure(error, { source: 'turn' })).toEqual({
      source: 'turn',
      message: 'sandbox initialization failed',
      code: 'sandbox_error',
    });
  });

  it('normalizes externally tagged Codex errors and nested JSON-RPC data', () => {
    expect(
      buildCodexProviderError(
        {
          message: 'upstream unavailable',
          data: {
            codexErrorInfo: {
              httpConnectionFailed: { httpStatusCode: 503 },
            },
          },
        },
        { source: 'json-rpc', fatal: true },
      ),
    ).toEqual({
      source: 'json-rpc',
      message: 'upstream unavailable',
      kind: 'httpConnectionFailed',
      httpStatusCode: 503,
      fatal: true,
    });

    expect(
      buildCodexSandboxFailure(
        {
          message: 'request failed',
          data: {
            message: 'sandbox denied',
            codexErrorInfo: { type: 'SandboxError' },
          },
        },
        { source: 'json-rpc' },
      ),
    ).toEqual({ source: 'json-rpc', message: 'request failed' });
  });

  it('does not infer sandbox failures from message text alone', () => {
    expect(
      buildCodexSandboxFailure(new Error('bwrap sandbox failed'), { source: 'provider' }),
    ).toBeUndefined();
  });

  it('reports only explicitly structured dropped event counts', () => {
    const health = buildCodexExecutionHealth({
      eventCoverage: 'stream',
      items: [
        {
          id: 'drop-1',
          type: 'error',
          message: 'in-process app-server event stream lagged; dropped 133 events',
        },
        {
          id: 'drop-2',
          type: 'error',
          message: 'structured drop report',
          dropped_event_count: 3,
        },
      ],
    });

    expect(health.droppedEvents).toEqual([
      {
        source: 'event-stream',
        reason: 'reported',
        count: 3,
        itemId: 'drop-2',
        itemType: 'error',
      },
    ]);
    expect(health.providerErrors).toHaveLength(2);
    expect(health.providerErrors.every((error) => error.fatal === false)).toBe(true);
  });

  it('aggregates repeated dropped-event observations without losing their count', () => {
    const health = buildCodexExecutionHealth({
      eventCoverage: 'stream',
      droppedEvents: [
        { source: 'json-rpc', reason: 'malformed', count: 1 },
        { source: 'json-rpc', reason: 'malformed', count: 1 },
        { source: 'json-rpc', reason: 'oversized', count: 2 },
      ],
    });

    expect(health.droppedEvents).toEqual([
      { source: 'json-rpc', reason: 'malformed', count: 2 },
      { source: 'json-rpc', reason: 'oversized', count: 2 },
    ]);
  });

  it('includes successful skill calls in the versioned envelope', () => {
    const health = buildCodexExecutionHealth({
      eventCoverage: 'final-items',
      successfulSkillCalls: [
        {
          name: 'security-scan',
          path: '.agents/skills/security-scan/SKILL.md',
          source: 'heuristic',
        },
      ],
    });

    expect(health).toMatchObject({
      schemaVersion: 1,
      eventCoverage: 'final-items',
      successfulSkillCalls: [
        {
          name: 'security-scan',
          path: '.agents/skills/security-scan/SKILL.md',
          source: 'heuristic',
        },
      ],
    });
  });
});
