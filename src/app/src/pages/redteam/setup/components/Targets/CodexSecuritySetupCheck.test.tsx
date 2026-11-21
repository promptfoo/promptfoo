import {
  createMockResponse,
  getCallApiMock,
  mockCallApiResponse,
  mockCallApiRoutes,
  rejectCallApi,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CodexSecuritySetupCheck from './CodexSecuritySetupCheck';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));

const provider: ProviderOptions = {
  id: 'openai:codex-security',
  label: 'Standard scan',
  config: { repository: '/local/repository', operation: 'security-scan' },
};

describe('CodexSecuritySetupCheck', () => {
  beforeEach(() => {
    resetCallApiMock();
  });

  it('checks the current provider configuration and explains the limits of a successful check', async () => {
    const user = userEvent.setup();
    mockCallApiRoutes([
      {
        method: 'POST',
        path: '/providers/test',
        response: { testResult: { success: true, message: 'Local repository path is available.' } },
      },
    ]);
    render(<CodexSecuritySetupCheck provider={provider} />);

    expect(getCallApiMock()).not.toHaveBeenCalled();
    expect(screen.getByText(/No scan or model call is run/)).toHaveTextContent(
      'Runtime, credentials, account access, and model availability are not verified.',
    );
    await user.click(screen.getByRole('button', { name: 'Check setup' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Local setup check passed. Local repository path is available.',
    );
    expect(getCallApiMock()).toHaveBeenCalledExactlyOnceWith('/providers/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerOptions: provider }),
      signal: expect.any(AbortSignal),
    });
    expect(screen.getByRole('button', { name: 'Check setup' })).toBeEnabled();
  });

  it('shows a local preflight failure without treating it as a connection success', async () => {
    const user = userEvent.setup();
    mockCallApiResponse({
      testResult: { success: false, error: 'Repository path does not exist on the server.' },
    });
    render(<CodexSecuritySetupCheck provider={provider} />);

    await user.click(screen.getByRole('button', { name: 'Check setup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Local setup check failed. Repository path does not exist on the server.',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check setup' })).toBeEnabled();
  });

  it('shows a request failure and allows retrying the check', async () => {
    const user = userEvent.setup();
    rejectCallApi(new Error('Server unavailable'));
    render(<CodexSecuritySetupCheck provider={provider} />);

    await user.click(screen.getByRole('button', { name: 'Check setup' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');

    mockCallApiResponse({ testResult: { success: true } });
    await user.click(screen.getByRole('button', { name: 'Check setup' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Local setup check passed. Local configuration checks completed.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['null response', null],
    ['missing result', {}],
    ['non-boolean success', { testResult: { success: 'true' } }],
    ['non-string message', { testResult: { success: true, message: { detail: 'invalid' } } }],
    ['non-string error', { testResult: { success: false, error: ['invalid'] } }],
  ])('handles a malformed %s without rendering it', async (_name, response) => {
    const user = userEvent.setup();
    mockCallApiResponse(response);
    render(<CodexSecuritySetupCheck provider={provider} />);

    await user.click(screen.getByRole('button', { name: 'Check setup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Setup check could not complete. Check the server logs and try again.',
    );
    expect(screen.getByRole('button', { name: 'Check setup' })).toBeEnabled();
  });

  it('handles a response that is not valid JSON', async () => {
    const user = userEvent.setup();
    const response = createMockResponse(undefined);
    vi.mocked(response.json).mockRejectedValue(new SyntaxError('Invalid JSON'));
    getCallApiMock().mockResolvedValue(response);
    render(<CodexSecuritySetupCheck provider={provider} />);

    await user.click(screen.getByRole('button', { name: 'Check setup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Setup check could not complete.');
    expect(screen.getByRole('button', { name: 'Check setup' })).toBeEnabled();
  });

  it('rejects an unsuccessful HTTP response even if its body claims success', async () => {
    const user = userEvent.setup();
    mockCallApiResponse({ testResult: { success: true } }, { status: 500 });
    render(<CodexSecuritySetupCheck provider={provider} />);

    await user.click(screen.getByRole('button', { name: 'Check setup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Setup check could not complete.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears a previous result when the provider configuration changes', async () => {
    const user = userEvent.setup();
    mockCallApiResponse({ testResult: { success: true } });
    const { rerender } = render(<CodexSecuritySetupCheck provider={provider} />);
    await user.click(screen.getByRole('button', { name: 'Check setup' }));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    rerender(
      <CodexSecuritySetupCheck
        provider={{ ...provider, config: { ...provider.config, repository: '/local/other' } }}
      />,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check setup' })).toBeEnabled();
  });

  it.each(['resolve', 'reject'])(
    'aborts a changed configuration and ignores its late %s',
    async (outcome) => {
      const user = userEvent.setup();
      let resolveOldRequest!: (value: Response) => void;
      let rejectOldRequest!: (reason: Error) => void;
      getCallApiMock().mockReturnValueOnce(
        new Promise<Response>((resolve, reject) => {
          resolveOldRequest = resolve;
          rejectOldRequest = reject;
        }),
      );
      const { rerender } = render(<CodexSecuritySetupCheck provider={provider} />);
      await user.click(screen.getByRole('button', { name: 'Check setup' }));
      const oldSignal = getCallApiMock().mock.calls[0][1]?.signal;
      expect(screen.getByRole('button', { name: 'Checking setup…' })).toBeDisabled();

      rerender(
        <CodexSecuritySetupCheck
          provider={{ ...provider, config: { ...provider.config, repository: '/local/other' } }}
        />,
      );
      expect(oldSignal?.aborted).toBe(true);
      getCallApiMock().mockResolvedValueOnce(
        createMockResponse({
          testResult: { success: true, message: 'Current repository checked.' },
        }),
      );
      await user.click(screen.getByRole('button', { name: 'Check setup' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Current repository checked.');

      await act(async () => {
        if (outcome === 'resolve') {
          resolveOldRequest(
            createMockResponse({
              testResult: { success: false, error: 'Stale repository error.' },
            }),
          );
        } else {
          rejectOldRequest(new Error('Stale request error.'));
        }
      });

      expect(screen.getByRole('status')).toHaveTextContent('Current repository checked.');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check setup' })).toBeEnabled();
    },
  );

  it('aborts an in-flight check when the component unmounts', async () => {
    const user = userEvent.setup();
    getCallApiMock().mockReturnValue(new Promise<Response>(() => {}));
    const { unmount } = render(<CodexSecuritySetupCheck provider={provider} />);
    await user.click(screen.getByRole('button', { name: 'Check setup' }));
    const signal = getCallApiMock().mock.calls[0][1]?.signal;

    unmount();

    expect(signal?.aborted).toBe(true);
  });
});
