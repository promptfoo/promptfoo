import { mockDocumentExecCommand } from '@app/tests/browserMocks';
import { callApi } from '@app/utils/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareModal from './ShareModal';

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));

function availabilityResponse(
  overrides: Partial<{
    domain: string;
    isCloudEnabled: boolean;
    sharingEnabled: boolean;
    sharingDisabledReason: string;
    isRetryable: boolean;
  }> = {},
) {
  return Response.json({
    domain: 'http://localhost:3000',
    isCloudEnabled: true,
    sharingEnabled: true,
    isRetryable: false,
    ...overrides,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('ShareModal', () => {
  const mockOnClose = vi.fn();
  const mockOnShare = vi.fn();
  const mockCallApi = vi.mocked(callApi);
  const defaultProps = {
    open: true,
    onClose: mockOnClose,
    evalId: 'eval-1',
    onShare: mockOnShare,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocumentExecCommand();
    mockCallApi.mockImplementation(() => Promise.resolve(availabilityResponse()));
  });

  it('does not start a request while closed', () => {
    render(<ShareModal {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockCallApi).not.toHaveBeenCalled();
    expect(mockOnShare).not.toHaveBeenCalled();
  });

  it('announces progress while the share request is pending', async () => {
    mockOnShare.mockImplementation(() => new Promise(() => {}));

    render(<ShareModal {...defaultProps} />);

    expect(await screen.findByRole('status')).toHaveTextContent('Generating share link...');
    expect(mockOnShare).toHaveBeenCalledWith('eval-1');
  });

  it('renders a validated share URL and copies it', async () => {
    const url = 'https://promptfoo.app/eval/shared';
    mockOnShare.mockResolvedValue(url);

    render(<ShareModal {...defaultProps} />);

    expect(await screen.findByDisplayValue(url)).toBeInTheDocument();
    expect(
      screen.getByText('This URL is accessible to users with access to your organization.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy share URL' }));
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('does not share when a fresh auth check is unauthorized', async () => {
    mockCallApi.mockResolvedValue(
      availabilityResponse({
        sharingEnabled: false,
        sharingDisabledReason:
          'Authentication failed (HTTP 401). Run `promptfoo auth login` to re-authenticate.',
      }),
    );

    render(<ShareModal {...defaultProps} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 401');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(mockOnShare).not.toHaveBeenCalled();
  });

  it('offers retry for a transient availability failure', async () => {
    mockCallApi
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(availabilityResponse());
    mockOnShare.mockResolvedValue('https://promptfoo.app/eval/retried');

    render(<ShareModal {...defaultProps} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByDisplayValue('https://promptfoo.app/eval/retried'),
    ).toBeInTheDocument();
    expect(mockCallApi).toHaveBeenCalledTimes(2);
  });

  it('treats a malformed availability response as retryable and never shares', async () => {
    mockCallApi.mockResolvedValue(Response.json({ sharingEnabled: true }));

    render(<ShareModal {...defaultProps} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid response');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(mockOnShare).not.toHaveBeenCalled();
  });

  it('allows a failed share request to be retried', async () => {
    mockOnShare
      .mockRejectedValueOnce(new Error('Failed to generate share URL'))
      .mockResolvedValueOnce('https://promptfoo.app/eval/recovered');

    render(<ShareModal {...defaultProps} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to generate share URL');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByDisplayValue('https://promptfoo.app/eval/recovered'),
    ).toBeInTheDocument();
    expect(mockOnShare).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('rejects a %s share URL', async (_label, url) => {
    mockOnShare.mockResolvedValue(url);

    render(<ShareModal {...defaultProps} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server did not return a valid share URL.',
    );
  });

  it('ignores an out-of-order share completion after switching evals', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    mockOnShare.mockImplementation((id: string) =>
      id === 'eval-1' ? first.promise : second.promise,
    );

    const { rerender } = render(<ShareModal {...defaultProps} evalId="eval-1" />);
    await waitFor(() => expect(mockOnShare).toHaveBeenCalledWith('eval-1'));

    rerender(<ShareModal {...defaultProps} evalId="eval-2" />);
    await waitFor(() => expect(mockOnShare).toHaveBeenCalledWith('eval-2'));

    await act(async () => second.resolve('https://promptfoo.app/eval/two'));
    expect(await screen.findByDisplayValue('https://promptfoo.app/eval/two')).toBeInTheDocument();

    await act(async () => first.resolve('https://promptfoo.app/eval/one'));
    expect(screen.getByDisplayValue('https://promptfoo.app/eval/two')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('https://promptfoo.app/eval/one')).not.toBeInTheDocument();
  });

  it('aborts the preflight when the modal closes', () => {
    mockCallApi.mockImplementation(() => new Promise(() => {}));

    const { rerender } = render(<ShareModal {...defaultProps} />);
    const signal = mockCallApi.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);

    rerender(<ShareModal {...defaultProps} open={false} />);
    expect(signal?.aborted).toBe(true);
  });

  it('encodes the eval id and closes through the visible button', async () => {
    mockOnShare.mockResolvedValue('https://promptfoo.app/eval/shared');

    render(<ShareModal {...defaultProps} evalId="eval/id with space" />);

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith(
        '/results/share/check-domain?id=eval%2Fid%20with%20space',
        { signal: expect.any(AbortSignal) },
      );
    });
    await screen.findByDisplayValue('https://promptfoo.app/eval/shared');
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    expect(mockOnClose).toHaveBeenCalledOnce();
  });
});
