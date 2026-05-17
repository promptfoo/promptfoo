import { EvalHistoryProvider } from '@app/contexts/EvalHistoryContext';
import { useStore } from '@app/stores/evalConfig';
import {
  getCallApiMock,
  mockCallApiRoutes,
  rejectCallApi,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { type TestTimers, useTestTimers } from '@app/tests/timers';
import { act, render, screen, waitFor } from '@testing-library/react';
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

  it('should be enabled for scalar provider, prompt, and test configs', () => {
    useStore.getState().updateConfig({
      prompts: 'file://prompt.txt',
      providers: 'openai:gpt-4',
      tests: 'file://tests.csv',
    });

    renderWithProvider(<RunTestSuiteButton />);

    expect(screen.getByRole('button', { name: 'Run Eval' })).not.toBeDisabled();
  });

  it('should serialize scalar prompt configs as an array before submitting eval jobs', async () => {
    mockCallApiRoutes([{ method: 'POST', path: '/eval/job', response: { id: '123' } }]);
    useStore.getState().updateConfig({
      prompts: 'file://prompt.txt',
      providers: 'openai:gpt-4',
      tests: 'file://tests.csv',
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Eval' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const [, requestInit] = getCallApiMock().mock.calls[0] as [string, RequestInit];
    expect(typeof requestInit.body).toBe('string');
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      prompts: ['file://prompt.txt'],
      providers: 'openai:gpt-4',
      tests: 'file://tests.csv',
    });
  });

  it('should serialize legacy prompt maps into prompt objects before submitting eval jobs', async () => {
    mockCallApiRoutes([{ method: 'POST', path: '/eval/job', response: { id: '123' } }]);
    useStore.getState().updateConfig({
      prompts: { 'file://prompt.txt': 'Prompt label' },
      providers: 'openai:gpt-4',
      tests: 'file://tests.csv',
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Eval' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const [, requestInit] = getCallApiMock().mock.calls[0] as [string, RequestInit];
    expect(typeof requestInit.body).toBe('string');
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      prompts: [{ raw: 'file://prompt.txt', label: 'Prompt label' }],
      providers: 'openai:gpt-4',
      tests: 'file://tests.csv',
    });
  });

  it('should be disabled for provider option objects without ids', () => {
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: [{ label: 'Missing id', config: { foo: 'bar' } }],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);

    expect(screen.getByRole('button', { name: 'Run Eval' })).toBeDisabled();
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

  it('should stop polling when unmounted', async () => {
    const mockJobId = '123';
    mockCallApiRoutes([{ method: 'POST', path: '/eval/job', response: { id: mockJobId } }]);

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    const { unmount } = renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      await timers.advanceByAsync(1500);
    });

    expect(getCallApiMock()).toHaveBeenCalledTimes(1);
  });

  it('should not start polling if unmounted before job creation finishes', async () => {
    let resolveJobCreation: ((value: Response) => void) | undefined;
    getCallApiMock().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveJobCreation = resolve;
        }),
    );

    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    const { unmount } = renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Eval' });

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    unmount();

    await act(async () => {
      resolveJobCreation?.(
        new Response(JSON.stringify({ id: 'late-job' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
      await timers.advanceByAsync(1500);
    });

    expect(getCallApiMock()).toHaveBeenCalledTimes(1);
  });
});
