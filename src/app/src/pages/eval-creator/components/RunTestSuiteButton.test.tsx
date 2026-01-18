import { useStore } from '@app/stores/evalConfig';
import { callApi } from '@app/utils/api';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RunTestSuiteButton from './RunTestSuiteButton';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

describe('RunTestSuiteButton', () => {
  beforeEach(() => {
    useStore.getState().reset();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    try {
      vi.runOnlyPendingTimers();
    } catch {
      // Ignore if not using fake timers
    }
    vi.useRealTimers();
  });

  it('should be disabled when there are no prompts or tests', () => {
    render(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be disabled when there are prompts but no tests', () => {
    useStore.getState().updateConfig({ prompts: ['prompt 1'] });
    render(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be disabled when there are tests but no prompts', () => {
    useStore.getState().updateConfig({ tests: [{ vars: { foo: 'bar' } }] });
    render(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).toBeDisabled();
  });

  it('should be enabled when there is at least one prompt and one test', () => {
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });
    render(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).not.toBeDisabled();
  });

  it('should handle progress API failure after job creation', async () => {
    const mockJobId = '123';
    const mockCallApi = vi.mocked(callApi);
    const mockAlert = vi.spyOn(window, 'alert').mockImplementation(() => {});

    mockCallApi
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: mockJobId }) } as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Progress API failed' }),
      } as any);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    render(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });
    expect(button).not.toBeDisabled();

    // Click the button with fake timers active to control the interval
    await act(async () => {
      fireEvent.click(button);
    });

    // Advance timers to trigger the polling interval (1000ms in the component)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(mockAlert).toHaveBeenCalledWith(`An error occurred: HTTP error! status: 500`);

    mockAlert.mockRestore();
  });

  it('should revert to non-running state and display an error message when the initial API call fails', async () => {
    const errorMessage = 'Failed to submit test suite';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Mock callApi to reject with an error
    vi.mocked(callApi).mockRejectedValue(new Error(errorMessage));

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    render(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });

    // Use real timers for the click and wait for async operations
    vi.useRealTimers();
    await userEvent.click(button);

    // Wait for the alert to be called
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(`An error occurred: ${errorMessage}`);
    });

    expect(screen.getByRole('button', { name: 'Run Eval' })).toBeInTheDocument();

    alertMock.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.useFakeTimers();
  });

  it('clears the polling interval on unmount', async () => {
    vi.useRealTimers();

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

    const { unmount } = render(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });

    await userEvent.click(button);

    // Wait for the interval to be set up
    await waitFor(
      () => {
        expect(setIntervalSpy).toHaveBeenCalled();
      },
      { timeout: 2000 },
    );

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
