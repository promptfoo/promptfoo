import { EvalHistoryProvider } from '@app/contexts/EvalHistoryContext';
import { useStore } from '@app/stores/evalConfig';
import { mockCallApiRoutes, rejectCallApi, resetCallApiMock } from '@app/tests/apiMocks';
import { type TestTimers, useTestTimers } from '@app/tests/timers';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
      fireEvent.click(button);
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
});
