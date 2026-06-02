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
let sourceEvalId: string | undefined;

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ state: sourceEvalId ? { sourceEvalId } : null }),
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
    sourceEvalId = undefined;
    timers = useTestTimers();
  });

  it('should be disabled when there are no prompts or tests', () => {
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Evaluation' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Add at least one provider to evaluate.');
  });

  it('should be disabled when there are prompts but no tests', () => {
    useStore.getState().updateConfig({ prompts: ['prompt 1'] });
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Evaluation' });
    expect(button).toBeDisabled();
  });

  it('should be disabled when there are tests but no prompts', () => {
    useStore.getState().updateConfig({ tests: [{ vars: { foo: 'bar' } }] });
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Evaluation' });
    expect(button).toBeDisabled();
  });

  it('should be enabled when there is at least one prompt and one test', () => {
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });
    renderWithProvider(<RunTestSuiteButton />);
    const button = screen.getByRole('button', { name: 'Run Evaluation' });
    expect(button).not.toBeDisabled();
  });

  it('blocks launch and explains an invalid run-settings reason', () => {
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(
      <RunTestSuiteButton disabledReason="Fix invalid optional run settings before starting." />,
    );

    const button = screen.getByRole('button', { name: 'Run Evaluation' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'Fix invalid optional run settings before starting.',
    );
  });

  it('should be disabled when a test case omits a required prompt variable', () => {
    useStore.getState().updateConfig({
      prompts: ['Write about {{topic}} for {{audience}}'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { topic: 'testing' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);

    const button = screen.getByRole('button', { name: 'Run Evaluation' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'Test case 1 is missing values required by your prompts.',
    );
  });

  it('blocks an imported test case whose assertion is missing a runnable value', () => {
    useStore.getState().updateConfig({
      prompts: ['Write a summary'],
      providers: ['openai:gpt-4'],
      tests: [{ assert: [{ type: 'contains', value: '' }] }],
    });

    renderWithProvider(<RunTestSuiteButton />);

    const button = screen.getByRole('button', { name: 'Run Evaluation' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Add required assertion values in test case 1.');
  });

  it('should accept prompt variables supplied by default test values', () => {
    useStore.getState().updateConfig({
      prompts: ['Write about {{topic}} for {{audience}}'],
      providers: ['openai:gpt-4'],
      defaultTest: { vars: { audience: 'developers' } },
      tests: [{ vars: { topic: 'testing' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);

    expect(screen.getByRole('button', { name: 'Run Evaluation' })).not.toBeDisabled();
  });

  it('should be enabled for scalar provider, prompt, and test configs', () => {
    useStore.getState().updateConfig({
      prompts: 'file://prompt.txt',
      providers: 'openai:gpt-4',
      tests: 'file://tests.csv',
    });

    renderWithProvider(<RunTestSuiteButton />);

    expect(screen.getByRole('button', { name: 'Run Evaluation' })).not.toBeDisabled();
  });

  it('announces that an evaluation is starting while waiting for progress', async () => {
    mockCallApiRoutes([{ method: 'POST', path: '/eval/job', response: { id: '123' } }]);
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Evaluation' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: 'Running evaluation' })).toBeDisabled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Starting evaluation and preparing requests.');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('announces measurable progress while an evaluation is running', async () => {
    mockCallApiRoutes([
      { method: 'POST', path: '/eval/job', response: { id: '123' } },
      {
        path: '/eval/job/123/',
        response: { status: 'in-progress', progress: 1, total: 2, logs: [] },
      },
    ]);
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Evaluation' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await timers.advanceByAsync(1500);
    });

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('50% complete. Results open automatically when finished.');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('explains when a completed evaluation has no saved results to open', async () => {
    mockCallApiRoutes([
      { method: 'POST', path: '/eval/job', response: { id: '123' } },
      {
        path: '/eval/job/123/',
        response: { status: 'complete', result: null, evalId: null, logs: [] },
      },
    ]);
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Evaluation' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await timers.advanceByAsync(1500);
    });

    const message =
      'The evaluation completed, but no saved results are available to open. Review the setup and run it again.';
    expect(mockShowToast).toHaveBeenCalledWith(message, 'warning');
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Run Evaluation' })).toBeEnabled();
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
        .getByRole('button', { name: 'Run Evaluation' })
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
        .getByRole('button', { name: 'Run Evaluation' })
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

  it('should include the source eval id when rerunning a loaded evaluation', async () => {
    sourceEvalId = 'source-eval-id';
    mockCallApiRoutes([{ method: 'POST', path: '/eval/job', response: { id: '123' } }]);
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['echo'],
      tests: 'az://account/container/tests.yaml?sp=r&sig=%5BREDACTED%5D',
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Evaluation' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const [, requestInit] = getCallApiMock().mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(requestInit.body as string)).toMatchObject({
      sourceEvalId: 'source-eval-id',
      tests: 'az://account/container/tests.yaml?sp=r&sig=%5BREDACTED%5D',
    });
  });

  it('should be disabled for provider option objects without ids', () => {
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: [{ label: 'Missing id', config: { foo: 'bar' } }],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);

    expect(screen.getByRole('button', { name: 'Run Evaluation' })).toBeDisabled();
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
    const button = screen.getByRole('button', { name: 'Run Evaluation' });
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
      'An error occurred: Could not retrieve evaluation progress (HTTP 500). Try again or review server logs.',
      'error',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not retrieve evaluation progress (HTTP 500). Try again or review server logs.',
    );
  });

  it('guides recovery when an evaluation job fails without diagnostic logs', async () => {
    mockCallApiRoutes([
      { method: 'POST', path: '/eval/job', response: { id: '123' } },
      {
        path: '/eval/job/123/',
        response: { status: 'error', logs: [] },
      },
    ]);
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Evaluation' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await timers.advanceByAsync(1500);
    });

    const message =
      'The evaluation failed before results were saved. Review provider settings and test inputs, then try again.';
    expect(mockShowToast).toHaveBeenCalledWith(`An error occurred: ${message}`, 'error');
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Run Evaluation' })).toBeEnabled();
  });

  it('preserves diagnostic logs while explaining a failed evaluation job', async () => {
    mockCallApiRoutes([
      { method: 'POST', path: '/eval/job', response: { id: '123' } },
      {
        path: '/eval/job/123/',
        response: { status: 'error', logs: ['Provider authentication failed'] },
      },
    ]);
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    await act(async () => {
      screen
        .getByRole('button', { name: 'Run Evaluation' })
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await Promise.resolve();
      await timers.advanceByAsync(1500);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The evaluation failed before results were saved. Details: Provider authentication failed',
    );
  });

  it('explains how to recover when evaluation creation is rejected', async () => {
    mockCallApiRoutes([{ method: 'POST', path: '/eval/job', ok: false, status: 400 }]);
    useStore.getState().updateConfig({
      prompts: ['prompt 1'],
      providers: ['openai:gpt-4'],
      tests: [{ vars: { foo: 'bar' } }],
    });

    renderWithProvider(<RunTestSuiteButton />);
    timers.useRealTimers();
    await userEvent.click(screen.getByRole('button', { name: 'Run Evaluation' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not start the evaluation (HTTP 400). Check the setup and try again.',
      );
    });
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
    const button = screen.getByRole('button', { name: 'Run Evaluation' });

    // Use real timers for the click and wait for async operations
    timers.useRealTimers();
    await userEvent.click(button);

    // Wait for toast + inline error to update
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(`An error occurred: ${errorMessage}`, 'error');
      expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    });

    expect(screen.getByRole('button', { name: 'Run Evaluation' })).toBeInTheDocument();
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
    const button = screen.getByRole('button', { name: 'Run Evaluation' });

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
    const button = screen.getByRole('button', { name: 'Run Evaluation' });

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
