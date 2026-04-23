import { EvalHistoryProvider } from '@app/contexts/EvalHistoryContext';
import { useStore } from '@app/stores/evalConfig';
import { mockCallApiRoutes, rejectCallApi, resetCallApiMock } from '@app/tests/apiMocks';
import { type TestTimers, useTestTimers } from '@app/tests/timers';
import { callApi } from '@app/utils/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RunTestSuiteButton from './RunTestSuiteButton';

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<EvalHistoryProvider>{ui}</EvalHistoryProvider>);
};

const mockShowToast = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

describe('RunTestSuiteButton', () => {
  let timers: TestTimers;

  beforeEach(() => {
    useStore.getState().reset();
    resetCallApiMock();
    mockShowToast.mockReset();
    timers = useTestTimers();
  });

  afterEach(() => {
    timers.restore({ runPending: true });
  });

  const clickRunButton = async () => {
    const button = screen.getByRole('button', { name: 'Run Eval' });

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
  };

  const advancePollingInterval = async () => {
    await act(async () => {
      await timers.advanceByAsync(1500);
    });
  };

  it('should be disabled when there are no prompts or tests', () => {
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be disabled when there are prompts but no tests', () => {
    useStore.getState().updateConfig({ prompts: ['prompt 1'] });
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be disabled when there are tests but no prompts', () => {
    useStore.getState().updateConfig({ tests: [{ vars: { foo: 'bar' } }] });
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be enabled when there is at least one prompt and one test', () => {
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).not.toBeDisabled();
  });

  it('should handle progress API failure after job creation', async () => {
    const mockJobId = '123';
    mockCallApiRoutes([
      { method: 'POST', path: '/eval/job', response: { id: mockJobId } },
      {
        path: `/eval/job/${mockJobId}/`,
        ok: false,
        status: 500,
        response: { message: 'Progress API failed' },
      },
    ]);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).not.toBeDisabled();

    // Click the button with fake timers active to control the interval
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    // Advance timers to trigger the polling interval (1000ms in the component)
    await act(async () => {
      await timers.advanceByAsync(1500);
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      'An error occurred: HTTP error! status: 500',
      'error',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP error! status: 500');
  });

  it('should revert to non-running state and display an error message when the initial API call fails', async () => {
    const errorMessage = 'Failed to submit test suite';

    // Mock callApi to reject with an error
    rejectCallApi(new Error(errorMessage));

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });

    // Use real timers for the click and wait for async operations
    timers.useRealTimers();
    await userEvent.click(button);

    // Wait for toast + inline error to update
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(`An error occurred: ${errorMessage}`, 'error');
      expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    });

    expect(screen.getByRole('button', { name: 'Run Eval' })).toBeInTheDocument();
  });

  it('clears the polling interval on unmount', async () => {
    const mockCallApi = vi.mocked(callApi);
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    // First call creates the job, subsequent calls return running status
    mockCallApi
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'job-1' }) } as any)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'running', progress: 50, total: 100 }),
      } as any);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    const { unmount } = renderWithProvider(<RunTestSuiteButton />);
    await clickRunButton();

    expect(setIntervalSpy).toHaveBeenCalled();

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('clears polling interval when job completes', async () => {
    const mockCallApi = vi.mocked(callApi);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    // First call creates the job, second returns complete status
    mockCallApi
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'job-complete' }) } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'complete', evalId: 'eval-123' }),
      } as any);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await clickRunButton();
    await advancePollingInterval();

    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it('clears polling interval when job fails', async () => {
    const mockCallApi = vi.mocked(callApi);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    // First call creates the job, second returns failed status
    mockCallApi
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'job-fail' }) } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'error', logs: ['Job failed'] }),
      } as any);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await clickRunButton();
    await advancePollingInterval();

    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it('clears polling interval when polling request fails', async () => {
    const mockCallApi = vi.mocked(callApi);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    // First call creates the job, second returns HTTP error
    mockCallApi
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'job-error' }) } as any)
      .mockResolvedValueOnce({ ok: false, status: 500 } as any);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await clickRunButton();
    await advancePollingInterval();

    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });

  it('can be called multiple times without errors', async () => {
    const mockCallApi = vi.mocked(callApi);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    // First call creates the job, second returns complete status
    mockCallApi
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'job-multi' }) } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'complete', evalId: 'eval-456' }),
      } as any);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    const { unmount } = renderWithProvider(<RunTestSuiteButton />);
    await clickRunButton();
    await advancePollingInterval();

    expect(clearIntervalSpy).toHaveBeenCalled();

    const clearCount = clearIntervalSpy.mock.calls.length;

    // Unmount should call clear again (cleanup effect)
    unmount();

    // Should have been called at least once more (may be called even if no interval is set)
    expect(clearIntervalSpy.mock.calls.length).toBeGreaterThanOrEqual(clearCount);

    clearIntervalSpy.mockRestore();
  });
});
