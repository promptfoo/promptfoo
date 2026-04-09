import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeScanRequestWithRetry } from '../../../src/codeScan/scanner/request';
import { sleepWithAbort } from '../../../src/util/time';

import type { ScanRequest, ScanResponse } from '../../../src/types/codeScan';
import type { AgentClient } from '../../../src/util/agent/agentClient';

vi.mock('../../../src/util/time', () => ({
  sleepWithAbort: vi.fn().mockResolvedValue(undefined),
}));

type ScanOutcome =
  | { type: 'complete'; response: ScanResponse }
  | { type: 'error'; message: string };

function createMockAgentClient(outcomes: ScanOutcome[]) {
  let completeHandler: ((response: ScanResponse) => void) | undefined;
  let errorHandler: ((error: { type: string; message: string }) => void) | undefined;
  let cancelledHandler: (() => void) | undefined;

  const client = {
    sessionId: 'test-session',
    start: vi.fn(() => {
      const outcome = outcomes.shift();

      queueMicrotask(() => {
        if (!outcome) {
          errorHandler?.({ type: 'test_error', message: 'No test outcome configured' });
          return;
        }

        if (outcome.type === 'complete') {
          completeHandler?.(outcome.response);
        } else {
          errorHandler?.({ type: 'agent_error', message: outcome.message });
        }
      });
    }),
    cancel: vi.fn(),
    onComplete: vi.fn((handler: (response: ScanResponse) => void) => {
      completeHandler = handler;
    }),
    onError: vi.fn((handler: (error: { type: string; message: string }) => void) => {
      errorHandler = handler;
    }),
    onCancelled: vi.fn((handler: () => void) => {
      cancelledHandler = handler;
    }),
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    socket: {
      io: {
        once: vi.fn(),
        off: vi.fn(),
      },
    },
  } as unknown as AgentClient;

  return {
    client,
    cancelledHandler: () => cancelledHandler,
  };
}

const scanRequest = {
  sessionId: 'test-session',
} as ScanRequest;

const scanResponse: ScanResponse = {
  success: true,
  comments: [],
  review: 'all clear',
};

function createExecutionOptions() {
  return {
    showSpinner: false,
    abortController: new AbortController(),
  };
}

describe('executeScanRequestWithRetry', () => {
  beforeEach(() => {
    vi.mocked(sleepWithAbort).mockReset();
    vi.mocked(sleepWithAbort).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.mocked(sleepWithAbort).mockReset();
  });

  it('retries once when the remote scanner times out waiting for MCP repository access', async () => {
    const { client } = createMockAgentClient([
      { type: 'error', message: 'Internal server error: MCP error -32001: Request timed out' },
      { type: 'complete', response: scanResponse },
    ]);

    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).resolves.toEqual(scanResponse);

    expect(client.start).toHaveBeenCalledTimes(2);
    expect(sleepWithAbort).toHaveBeenCalledTimes(1);
  });

  it('stops after one retry for repeated MCP repository access timeouts', async () => {
    const { client } = createMockAgentClient([
      { type: 'error', message: 'Internal server error: MCP error -32001: Request timed out' },
      { type: 'error', message: 'Internal server error: MCP error -32001: Request timed out' },
      { type: 'complete', response: scanResponse },
    ]);

    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).rejects.toThrow('Internal server error: MCP error -32001: Request timed out');

    expect(client.start).toHaveBeenCalledTimes(2);
    expect(sleepWithAbort).toHaveBeenCalledTimes(1);
  });

  it('continues to use the longer retry budget for server capacity errors', async () => {
    const { client } = createMockAgentClient([
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'complete', response: scanResponse },
    ]);

    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).resolves.toEqual(scanResponse);

    expect(client.start).toHaveBeenCalledTimes(3);
    expect(sleepWithAbort).toHaveBeenCalledTimes(2);
  });

  it('succeeds on first attempt without retrying', async () => {
    const { client } = createMockAgentClient([{ type: 'complete', response: scanResponse }]);

    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).resolves.toEqual(scanResponse);

    expect(client.start).toHaveBeenCalledTimes(1);
    expect(sleepWithAbort).not.toHaveBeenCalled();
  });

  it('enforces MCP timeout budget independently when preceded by capacity errors', async () => {
    const { client } = createMockAgentClient([
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Internal server error: MCP error -32001: Request timed out' },
      { type: 'error', message: 'Internal server error: MCP error -32001: Request timed out' },
      { type: 'complete', response: scanResponse },
    ]);

    // Two capacity retries succeed, then the MCP timeout budget (2) is exhausted
    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).rejects.toThrow('Internal server error: MCP error -32001: Request timed out');

    // 2 capacity + 2 MCP timeout = 4 total starts
    expect(client.start).toHaveBeenCalledTimes(4);
    expect(sleepWithAbort).toHaveBeenCalledTimes(3);
  });

  it('enforces capacity budget independently when preceded by MCP timeout', async () => {
    const { client } = createMockAgentClient([
      { type: 'error', message: 'Internal server error: MCP error -32001: Request timed out' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'complete', response: scanResponse },
    ]);

    // MCP timeout uses 1 of its 2 attempts, then capacity error uses 1 of its 7 → succeeds
    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).resolves.toEqual(scanResponse);

    expect(client.start).toHaveBeenCalledTimes(3);
    expect(sleepWithAbort).toHaveBeenCalledTimes(2);
  });

  it('can succeed after mixed transient failures exceed one policy total', async () => {
    const { client } = createMockAgentClient([
      { type: 'error', message: 'Internal server error: MCP error -32001: Request timed out' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'error', message: 'Server at capacity. Please retry.' },
      { type: 'complete', response: scanResponse },
    ]);

    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).resolves.toEqual(scanResponse);

    expect(client.start).toHaveBeenCalledTimes(8);
    expect(sleepWithAbort).toHaveBeenCalledTimes(7);
  });

  it('does not retry non-transient scanner errors', async () => {
    const { client } = createMockAgentClient([
      { type: 'error', message: 'Invalid scan request' },
      { type: 'complete', response: scanResponse },
    ]);

    await expect(
      executeScanRequestWithRetry(client, scanRequest, createExecutionOptions()),
    ).rejects.toThrow('Invalid scan request');

    expect(client.start).toHaveBeenCalledTimes(1);
    expect(sleepWithAbort).not.toHaveBeenCalled();
  });
});
