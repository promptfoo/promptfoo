import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGenerationStream } from './useGenerationStream';

vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: () => ({ apiBaseUrl: 'https://api.example.test/' }),
  },
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  readonly url: string;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

describe('useGenerationStream', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);
  });

  it('connects to the stream and handles progress, item, and completion events', async () => {
    const onProgress = vi.fn();
    const onTestCase = vi.fn();
    const onAssertion = vi.fn();
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useGenerationStream({ onProgress, onTestCase, onAssertion, onComplete }),
    );

    act(() => {
      result.current.connect('job-1');
    });

    const eventSource = MockEventSource.instances[0];
    expect(eventSource.url).toBe('https://api.example.test/api/generation/stream/job-1');

    act(() => {
      eventSource.onopen?.();
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'progress',
          jobId: 'job-1',
          current: 1,
          total: 3,
          phase: 'Generating',
        }),
      } as MessageEvent);
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'testcase',
          jobId: 'job-1',
          index: 0,
          testCase: { city: 'Paris' },
        }),
      } as MessageEvent);
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'assertion',
          jobId: 'job-1',
          index: 0,
          assertion: { type: 'contains', value: 'Paris' },
        }),
      } as MessageEvent);
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'complete',
          jobId: 'job-1',
          result: {
            testCases: [{ city: 'Paris' }],
            metadata: { totalGenerated: 1, durationMs: 4, provider: 'test' },
          },
        }),
      } as MessageEvent);
    });

    await waitFor(() => {
      expect(result.current.isConnected).toBe(false);
    });

    expect(result.current.jobId).toBe('job-1');
    expect(result.current.testCases).toEqual([{ city: 'Paris' }]);
    expect(result.current.assertions).toEqual([{ type: 'contains', value: 'Paris' }]);
    expect(onProgress).toHaveBeenCalledWith(1, 3, 'Generating');
    expect(onTestCase).toHaveBeenCalledWith({ city: 'Paris' }, 0);
    expect(onAssertion).toHaveBeenCalledWith({ type: 'contains', value: 'Paris' }, 0);
    expect(onComplete).toHaveBeenCalled();
    expect(eventSource.close).toHaveBeenCalled();
  });

  it('deduplicates streamed indexes and reports hard connection failures', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useGenerationStream({ onError, autoReconnect: false, maxReconnectAttempts: 1 }),
    );

    act(() => {
      result.current.connect('job-2');
    });

    const eventSource = MockEventSource.instances[0];

    act(() => {
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'testcase',
          jobId: 'job-2',
          index: 0,
          testCase: { city: 'Paris' },
        }),
      } as MessageEvent);
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'testcase',
          jobId: 'job-2',
          index: 0,
          testCase: { city: 'Berlin' },
        }),
      } as MessageEvent);
      eventSource.onerror?.();
    });

    await waitFor(() => {
      expect(result.current.connectionError).toBe(
        'Failed to connect to stream after multiple attempts',
      );
    });

    expect(result.current.testCases).toEqual([{ city: 'Paris' }]);
    expect(onError).not.toHaveBeenCalled();
    expect(eventSource.close).toHaveBeenCalled();
  });

  it('surfaces stream error events from the server', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useGenerationStream({ onError }));

    act(() => {
      result.current.connect('job-3');
    });

    const eventSource = MockEventSource.instances[0];
    act(() => {
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'error',
          jobId: 'job-3',
          error: 'generation failed',
        }),
      } as MessageEvent);
    });

    await waitFor(() => {
      expect(result.current.connectionError).toBe('generation failed');
    });

    expect(onError).toHaveBeenCalledWith('generation failed');
  });

  it('handles reconnect policy branches and duplicate assertion events', async () => {
    const { result } = renderHook(() =>
      useGenerationStream({ autoReconnect: false, maxReconnectAttempts: 3 }),
    );

    act(() => {
      result.current.connect('job-4');
    });

    const eventSource = MockEventSource.instances[0];
    act(() => {
      eventSource.onopen?.();
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'assertion',
          jobId: 'job-4',
          index: 0,
          assertion: { type: 'contains', value: 'Paris' },
        }),
      } as MessageEvent);
      eventSource.onmessage?.({
        data: JSON.stringify({
          type: 'assertion',
          jobId: 'job-4',
          index: 0,
          assertion: { type: 'contains', value: 'Berlin' },
        }),
      } as MessageEvent);
      eventSource.onerror?.();
    });

    await waitFor(() => {
      expect(result.current.connectionError).toBe('Connection failed');
    });
    expect(result.current.assertions).toEqual([{ type: 'contains', value: 'Paris' }]);
    expect(eventSource.close).toHaveBeenCalled();
  });

  it('keeps invalid SSE payloads from breaking the hook', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { result } = renderHook(() => useGenerationStream());

    act(() => {
      result.current.connect('job-5');
    });

    const eventSource = MockEventSource.instances[0];
    act(() => {
      eventSource.onmessage?.({ data: 'not-json' } as MessageEvent);
    });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
