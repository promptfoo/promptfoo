import { mockClipboard } from '@app/tests/browserMocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigAgent } from '../../hooks/useConfigAgent';
import ConfigAgentDrawer from './ConfigAgentDrawer';

import type { DiscoveredConfig } from '../../hooks/useConfigAgent';

vi.mock('../../hooks/useConfigAgent', () => ({
  useConfigAgent: vi.fn(),
}));

vi.mock('./ConfigAgentChat', () => ({
  default: ({ onSendMessage, onSelectOption, onSubmitApiKey }: any) => (
    <div>
      <div>mock chat</div>
      <button type="button" onClick={() => onSendMessage('hello')}>
        send chat
      </button>
      <button type="button" onClick={() => onSelectOption('apply')}>
        choose option
      </button>
      <button type="button" onClick={() => onSubmitApiKey('sk-test', 'apiKey')}>
        submit key
      </button>
    </div>
  ),
}));

const mockUseConfigAgent = vi.mocked(useConfigAgent);
let writeTextMock: ReturnType<typeof vi.fn>;

const finalConfig: DiscoveredConfig = {
  apiType: 'openai_compatible',
  method: 'POST',
  path: '/v1/chat/completions',
  headers: { Authorization: 'Bearer sk-test' },
  body: { messages: [{ role: 'user', content: '{{prompt}}' }] },
  transformResponse: 'json.choices[0].message.content',
};

const hookState = {
  sessionId: null,
  messages: [],
  session: null,
  isLoading: false,
  error: null,
  isComplete: false,
  finalConfig: null,
  startSession: vi.fn().mockResolvedValue(true),
  sendMessage: vi.fn(),
  selectOption: vi.fn(),
  submitApiKey: vi.fn(),
  confirm: vi.fn(),
  cancelSession: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
};

describe('ConfigAgentDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText: writeTextMock as Clipboard['writeText'] });
    mockUseConfigAgent.mockReturnValue({ ...hookState });
  });

  it('starts discovery from the initial URL and wires chat actions', async () => {
    const user = userEvent.setup();

    render(<ConfigAgentDrawer open onClose={vi.fn()} initialUrl="https://api.example.com" />);

    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://api.example.com');
    await user.click(screen.getByRole('button', { name: /start auto-discovery/i }));

    expect(hookState.startSession).toHaveBeenCalledWith('https://api.example.com');
    expect(await screen.findByText('mock chat')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'send chat' }));
    await user.click(screen.getByRole('button', { name: 'choose option' }));
    await user.click(screen.getByRole('button', { name: 'submit key' }));

    expect(hookState.sendMessage).toHaveBeenCalledWith('hello');
    expect(hookState.selectOption).toHaveBeenCalledWith('apply');
    expect(hookState.submitApiKey).toHaveBeenCalledWith('sk-test', 'apiKey');
  });

  it('does not enter chat mode when session creation fails', async () => {
    const user = userEvent.setup();
    hookState.startSession.mockResolvedValueOnce(false);

    render(<ConfigAgentDrawer open onClose={vi.fn()} initialUrl="https://api.example.com" />);

    await user.click(screen.getByRole('button', { name: /start auto-discovery/i }));

    expect(screen.queryByText('mock chat')).not.toBeInTheDocument();
  });

  it('shows errors, updates URL from props, and prevents empty starts', async () => {
    const user = userEvent.setup();
    mockUseConfigAgent.mockReturnValue({
      ...hookState,
      error: 'blocked url',
      isLoading: true,
    });

    const { rerender } = render(<ConfigAgentDrawer open onClose={vi.fn()} initialUrl="" />);

    expect(screen.getByText('blocked url')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /starting discovery/i })).toBeDisabled();

    mockUseConfigAgent.mockReturnValue({
      ...hookState,
      error: 'blocked url',
      isLoading: false,
    });
    rerender(<ConfigAgentDrawer open onClose={vi.fn()} initialUrl="https://new.example.com" />);
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue('https://new.example.com');

    await user.clear(screen.getByLabelText('Endpoint URL'));
    expect(screen.getByRole('button', { name: /start auto-discovery/i })).toBeDisabled();
  });

  it('closes and starts over by cancelling and resetting state', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ConfigAgentDrawer open onClose={onClose} initialUrl="https://api.example.com" />);

    await user.click(screen.getByRole('button', { name: /start auto-discovery/i }));
    await user.click(screen.getByRole('button', { name: 'Start over' }));

    expect(hookState.cancelSession).toHaveBeenCalledTimes(1);
    expect(hookState.reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('mock chat')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(hookState.cancelSession).toHaveBeenCalledTimes(2);
    expect(hookState.reset).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('copies the URL and applies a discovered configuration', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfigDiscovered = vi.fn();

    mockUseConfigAgent.mockReturnValue({
      ...hookState,
      session: {
        id: 'session-1',
        baseUrl: 'https://api.example.com',
        phase: 'complete',
        verified: true,
        finalConfig,
      },
      isComplete: true,
      finalConfig,
    });

    render(
      <ConfigAgentDrawer
        open
        onClose={onClose}
        initialUrl="https://api.example.com"
        onConfigDiscovered={onConfigDiscovered}
      />,
    );

    expect(onConfigDiscovered).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /start auto-discovery/i }));
    await user.click(screen.getByRole('button', { name: 'Copy URL' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /apply configuration/i }));
    expect(onConfigDiscovered).toHaveBeenCalledWith(finalConfig, 'https://api.example.com');
    expect(hookState.cancelSession).toHaveBeenCalled();
    expect(hookState.reset).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
