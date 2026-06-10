import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelGenerationJob, getJobStatus } from '../api/generation';
import { useGenerationJob } from './useGenerationJob';

import type { GenerationResult } from '../api/generation';

vi.mock('../api/generation', () => ({
  cancelGenerationJob: vi.fn(),
  getJobStatus: vi.fn(),
}));

const mockCancelGenerationJob = vi.mocked(cancelGenerationJob);
const mockGetJobStatus = vi.mocked(getJobStatus);

describe('useGenerationJob', () => {
  beforeEach(() => {
    mockCancelGenerationJob.mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('starts a job, reports progress, and completes with the generated result', async () => {
    const onProgress = vi.fn();
    const onComplete = vi.fn();
    const resultPayload: GenerationResult = {
      testCases: [{ city: 'Paris' }],
      metadata: {
        totalGenerated: 1,
        durationMs: 12,
        provider: 'test',
      },
    };

    mockGetJobStatus.mockResolvedValue({
      id: 'job-1',
      type: 'dataset',
      status: 'complete',
      progress: 1,
      total: 1,
      phase: 'Done',
      result: resultPayload,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:01.000Z',
    });

    const { result } = renderHook(() =>
      useGenerationJob({ onProgress, onComplete, pollInterval: 10 }),
    );

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-1' }));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('complete');
    });

    expect(result.current.jobId).toBe('job-1');
    expect(result.current.phase).toBe('Done');
    expect(result.current.result).toEqual(resultPayload);
    expect(onProgress).toHaveBeenCalledWith(1, 1, 'Done');
    expect(onComplete).toHaveBeenCalledWith(resultPayload);
  });

  it('surfaces polling failures and start-job failures', async () => {
    const onError = vi.fn();
    mockGetJobStatus.mockRejectedValueOnce(new Error('status offline'));

    const { result } = renderHook(() => useGenerationJob({ onError, pollInterval: 10 }));

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-2' }));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('status offline');
    expect(onError).toHaveBeenCalledWith('status offline');

    await act(async () => {
      await expect(
        result.current.startJob('tests', async () => {
          throw new Error('start failed');
        }),
      ).rejects.toThrow('start failed');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('start failed');
    expect(onError).toHaveBeenLastCalledWith('start failed');
  });

  it('cancels active polling and resets state', async () => {
    mockGetJobStatus.mockResolvedValue({
      id: 'job-3',
      type: 'dataset',
      status: 'in-progress',
      progress: 2,
      total: 4,
      phase: 'Generating',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:01.000Z',
    });

    const { result } = renderHook(() => useGenerationJob({ pollInterval: 10 }));

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-3' }));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('in-progress');
    });

    await act(async () => {
      await result.current.cancelJob();
    });
    expect(mockCancelGenerationJob).toHaveBeenCalledWith('job-3');
    expect(result.current.status).toBe('idle');
    expect(result.current.phase).toBe('');

    act(() => {
      result.current.reset();
    });
    expect(result.current.jobId).toBeNull();
    expect(result.current.progress).toBe(0);
    expect(result.current.total).toBe(0);
    expect(result.current.result).toBeNull();
  });

  it('ignores a successful poll that resolves after the job is cancelled', async () => {
    const onComplete = vi.fn();
    const resultPayload: GenerationResult = {
      testCases: [{ city: 'Paris' }],
      metadata: { totalGenerated: 1, durationMs: 4, provider: 'test' },
    };
    let resolveStatus: ((value: Awaited<ReturnType<typeof getJobStatus>>) => void) | undefined;
    mockGetJobStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );

    const { result } = renderHook(() => useGenerationJob({ onComplete, pollInterval: 10 }));

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-cancelled' }));
    });
    await act(async () => {
      await result.current.cancelJob();
    });

    await act(async () => {
      resolveStatus?.({
        id: 'job-cancelled',
        type: 'dataset',
        status: 'complete',
        progress: 1,
        total: 1,
        phase: 'Done',
        result: resultPayload,
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
      });
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('ignores in-flight polling failures after cancellation', async () => {
    const onError = vi.fn();
    let rejectStatus: ((reason: Error) => void) | undefined;

    mockGetJobStatus.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectStatus = reject;
        }),
    );

    const { result } = renderHook(() => useGenerationJob({ onError, pollInterval: 10 }));

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-cancelled' }));
    });
    await act(async () => {
      await result.current.cancelJob();
    });

    await act(async () => {
      rejectStatus?.(new Error('late polling failure'));
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('ignores a failed poll superseded by a newer job', async () => {
    const onError = vi.fn();
    let rejectOldPoll: ((reason?: unknown) => void) | undefined;

    mockGetJobStatus
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectOldPoll = reject;
          }),
      )
      .mockResolvedValue({
        id: 'job-new',
        type: 'dataset',
        status: 'in-progress',
        progress: 1,
        total: 2,
        phase: 'Generating',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
      });

    const { result } = renderHook(() => useGenerationJob({ onError, pollInterval: 10 }));

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-old' }));
    });
    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-new' }));
    });
    await waitFor(() => {
      expect(result.current.jobId).toBe('job-new');
      expect(result.current.status).toBe('in-progress');
    });

    await act(async () => {
      rejectOldPoll?.(new Error('old polling failed'));
    });

    expect(result.current.jobId).toBe('job-new');
    expect(result.current.error).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps a newer job active when an earlier start request resolves last', async () => {
    let resolveFirstStart: ((value: { jobId: string }) => void) | undefined;
    let resolveSecondStart: ((value: { jobId: string }) => void) | undefined;
    mockGetJobStatus.mockResolvedValue({
      id: 'job-new',
      type: 'dataset',
      status: 'in-progress',
      progress: 1,
      total: 2,
      phase: 'Generating',
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:01.000Z',
    });

    const { result } = renderHook(() => useGenerationJob({ pollInterval: 10 }));
    let firstStart!: Promise<string>;
    let secondStart!: Promise<string>;

    act(() => {
      firstStart = result.current.startJob(
        'dataset',
        () =>
          new Promise((resolve) => {
            resolveFirstStart = resolve;
          }),
      );
      secondStart = result.current.startJob(
        'dataset',
        () =>
          new Promise((resolve) => {
            resolveSecondStart = resolve;
          }),
      );
    });

    await act(async () => {
      resolveSecondStart?.({ jobId: 'job-new' });
      await secondStart;
    });
    await waitFor(() => {
      expect(result.current.jobId).toBe('job-new');
    });

    await act(async () => {
      resolveFirstStart?.({ jobId: 'job-old' });
      await firstStart;
    });

    expect(result.current.jobId).toBe('job-new');
  });

  it('uses default error messaging and ignores async updates after unmount', async () => {
    const onError = vi.fn();
    let resolveStatus: ((value: Awaited<ReturnType<typeof getJobStatus>>) => void) | undefined;

    mockGetJobStatus
      .mockResolvedValueOnce({
        id: 'job-4',
        type: 'dataset',
        status: 'error',
        progress: 0,
        total: 1,
        phase: 'Failed',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStatus = resolve;
          }),
      );

    const { result, unmount } = renderHook(() => useGenerationJob({ onError, pollInterval: 10 }));

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-4' }));
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Generation failed');
    });
    expect(onError).toHaveBeenCalledWith('Generation failed');

    await act(async () => {
      await result.current.startJob('dataset', async () => ({ jobId: 'job-5' }));
    });
    unmount();

    await act(async () => {
      resolveStatus?.({
        id: 'job-5',
        type: 'dataset',
        status: 'complete',
        progress: 1,
        total: 1,
        phase: 'Done',
        createdAt: '2026-05-16T00:00:00.000Z',
        updatedAt: '2026-05-16T00:00:01.000Z',
      });
    });
  });
});
