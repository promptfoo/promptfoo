import type { ButtonHTMLAttributes, ReactNode, SyntheticEvent } from 'react';

import { callApi } from '@app/utils/api';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ShareMenuItem from './ShareMenuItem';

interface DropdownMenuItemMockProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  onSelect?: (event: SyntheticEvent<HTMLButtonElement>) => void;
}

const mockConstants = vi.hoisted(() => ({ IS_RUNNING_LOCALLY: true }));

vi.mock('@app/constants', () => ({
  get IS_RUNNING_LOCALLY() {
    return mockConstants.IS_RUNNING_LOCALLY;
  },
}));

vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));

vi.mock('@app/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children, onSelect, ...props }: DropdownMenuItemMockProps) => (
    <button type="button" role="menuitem" {...props} onClick={(event) => onSelect?.(event)}>
      {children}
    </button>
  ),
}));

vi.mock('@app/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

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

describe('ShareMenuItem', () => {
  const mockCallApi = vi.mocked(callApi);
  const mockOnClick = vi.fn();

  beforeEach(() => {
    mockConstants.IS_RUNNING_LOCALLY = true;
    vi.clearAllMocks();
  });

  it('keeps the checking state focusable and exposes status', () => {
    mockCallApi.mockImplementation(() => new Promise(() => {}));

    render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);

    const item = screen.getByRole('menuitem', { name: 'Checking sharing...' });
    expect(item).not.toBeDisabled();
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAttribute('aria-busy', 'true');
    item.focus();
    expect(item).toHaveFocus();
  });

  it('enables sharing after a successful availability check', async () => {
    mockCallApi.mockResolvedValue(availabilityResponse());

    render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);

    const item = await screen.findByRole('menuitem', { name: 'Share' });
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(item);
    expect(mockOnClick).toHaveBeenCalledOnce();
  });

  it('shows a definitive auth failure without removing the item from keyboard focus', async () => {
    mockCallApi.mockResolvedValue(
      availabilityResponse({
        sharingEnabled: false,
        sharingDisabledReason: 'Authentication failed (HTTP 401). Run `promptfoo auth login`.',
      }),
    );

    render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);

    const item = await screen.findByRole('menuitem', { name: 'Share' });
    expect(item).not.toBeDisabled();
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/HTTP 401/)).toBeInTheDocument();
    await userEvent.click(item);
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('retries transient failures in place', async () => {
    mockCallApi
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(availabilityResponse());

    render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);

    const retry = await screen.findByRole('menuitem', { name: 'Retry sharing check' });
    expect(retry).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    await userEvent.click(retry);

    const share = await screen.findByRole('menuitem', { name: 'Share' });
    expect(mockCallApi).toHaveBeenCalledTimes(2);
    expect(mockOnClick).not.toHaveBeenCalled();
    await userEvent.click(share);
    expect(mockOnClick).toHaveBeenCalledOnce();
  });

  it('does not expose network error details', async () => {
    mockCallApi.mockRejectedValue(new Error('connect ECONNREFUSED private-host.internal:443'));

    render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);

    expect(
      await screen.findByText(/Could not connect to the Promptfoo server/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/private-host/)).not.toBeInTheDocument();
  });

  it('ignores a stale availability response after switching evals', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    mockCallApi.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { rerender } = render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);
    const firstSignal = mockCallApi.mock.calls[0][1]?.signal;

    rerender(<ShareMenuItem evalId="eval-2" onClick={mockOnClick} />);
    expect(screen.getByRole('menuitem', { name: 'Checking sharing...' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve(
        availabilityResponse({
          sharingEnabled: false,
          sharingDisabledReason: 'Eval 2 is not authorized (HTTP 403).',
        }),
      );
    });
    expect(await screen.findByText(/Eval 2 is not authorized/)).toBeInTheDocument();

    await act(async () => {
      first.resolve(availabilityResponse());
    });
    expect(screen.getByText(/Eval 2 is not authorized/)).toBeInTheDocument();
  });

  it('aborts the availability request on unmount', () => {
    mockCallApi.mockImplementation(() => new Promise(() => {}));

    const { unmount } = render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);
    const signal = mockCallApi.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);

    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('encodes eval ids and sends an abort signal', async () => {
    mockCallApi.mockResolvedValue(availabilityResponse());

    render(<ShareMenuItem evalId="eval/id with space" onClick={mockOnClick} />);

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith(
        '/results/share/check-domain?id=eval%2Fid%20with%20space',
        { signal: expect.any(AbortSignal) },
      );
    });
  });

  it('blocks duplicate shares while one is in flight', async () => {
    mockCallApi.mockResolvedValue(availabilityResponse());

    render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} loading />);

    const item = await screen.findByRole('menuitem', { name: 'Sharing...' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(item);
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('skips the availability request outside the local app', async () => {
    mockConstants.IS_RUNNING_LOCALLY = false;

    render(<ShareMenuItem evalId="eval-1" onClick={mockOnClick} />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Share' }));
    expect(mockCallApi).not.toHaveBeenCalled();
    expect(mockOnClick).toHaveBeenCalledOnce();
  });
});
