import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigAgentChat from './ConfigAgentChat';

import type { AgentMessage, DiscoveredConfig } from '../../hooks/useConfigAgent';

let writeTextMock: ReturnType<typeof vi.fn>;

const discoveredConfig: DiscoveredConfig = {
  apiType: 'openai_compatible',
  method: 'POST',
  path: '/v1/chat/completions',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk-test' },
  body: {
    model: '{{model}}',
    messages: [{ role: 'user', content: '{{prompt}}' }],
    temperature: 0,
    stream: false,
    metadata: null,
  },
  transformResponse: 'json.choices[0].message.content',
  defaultModel: 'gpt-test',
  supportsStreaming: true,
};

const baseMessages: AgentMessage[] = [
  {
    id: 'status',
    type: 'status',
    content: 'Checking connectivity...',
    timestamp: 1,
  },
  {
    id: 'discovery',
    type: 'discovery',
    content: 'Found **OpenAI** with `json.choices[0].message.content`\nReady.',
    timestamp: 2,
    metadata: { discoveredConfig },
  },
  {
    id: 'success',
    type: 'success',
    content: 'Configuration verified!',
    timestamp: 3,
  },
  {
    id: 'error',
    type: 'error',
    content: 'Verification failed.',
    timestamp: 4,
  },
  {
    id: 'user',
    type: 'user',
    content: 'Use OpenAI format',
    timestamp: 5,
  },
];

describe('ConfigAgentChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
  });

  it('renders message variants, formatted text, typing state, and config preview', async () => {
    const user = userEvent.setup();

    render(
      <ConfigAgentChat
        messages={baseMessages}
        isLoading
        onSendMessage={vi.fn()}
        onSelectOption={vi.fn()}
        onSubmitApiKey={vi.fn()}
      />,
    );

    expect(screen.getByText('Checking connectivity...')).toBeInTheDocument();
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('json.choices[0].message.content')).toBeInTheDocument();
    expect(screen.getByText('Configuration verified!')).toBeInTheDocument();
    expect(screen.getByText('Verification failed.')).toBeInTheDocument();
    expect(screen.getByText('Use OpenAI format')).toBeInTheDocument();
    expect(screen.getByText('analyzing...')).toBeInTheDocument();
    expect(screen.getByText('config.json')).toBeInTheDocument();
    expect(screen.getByText('"openai_compatible"')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
    expect(screen.getByText('false')).toBeInTheDocument();
    expect(screen.getByText('null')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Configuration/ }));
    expect(screen.queryByText('config.json')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Configuration/ }));
    expect(screen.getByText('config.json')).toBeInTheDocument();
  });

  it('sends regular messages through button click and Enter', async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn();

    const { rerender } = render(
      <ConfigAgentChat
        messages={baseMessages}
        isLoading={false}
        onSendMessage={onSendMessage}
        onSelectOption={vi.fn()}
        onSubmitApiKey={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText('Type a message... (Enter to send)');
    await user.type(input, 'hello');
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[buttons.length - 1]);
    expect(onSendMessage).toHaveBeenCalledWith('hello');
    expect(input).toHaveValue('');

    rerender(
      <ConfigAgentChat
        messages={baseMessages}
        isLoading={false}
        onSendMessage={onSendMessage}
        onSelectOption={vi.fn()}
        onSubmitApiKey={vi.fn()}
      />,
    );
    await user.type(screen.getByPlaceholderText('Type a message... (Enter to send)'), 'retry');
    await user.keyboard('{Enter}');
    expect(onSendMessage).toHaveBeenCalledWith('retry');
  });

  it('handles quick options and secure API-key submission', async () => {
    const user = userEvent.setup();
    const onSelectOption = vi.fn();
    const onSubmitApiKey = vi.fn();
    const messages: AgentMessage[] = [
      ...baseMessages,
      {
        id: 'question',
        type: 'question',
        content: 'Do you have an API key?',
        timestamp: 6,
        metadata: {
          inputRequest: {
            type: 'api_key',
            prompt: 'Enter key',
            field: 'apiKey',
            sensitive: true,
            placeholder: 'Paste key...',
          },
          options: [
            { id: 'have_key', label: 'Yes', value: 'have_key', primary: true },
            { id: 'no_key', label: 'No', value: 'no_key' },
          ],
        },
      },
    ];

    render(
      <ConfigAgentChat
        messages={messages}
        isLoading={false}
        onSendMessage={vi.fn()}
        onSelectOption={onSelectOption}
        onSubmitApiKey={onSubmitApiKey}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onSelectOption).toHaveBeenCalledWith('have_key');

    const input = screen.getByPlaceholderText('Paste key...');
    expect(input).toHaveAttribute('type', 'password');

    await user.type(input, 'sk-secret');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(input).toHaveAttribute('type', 'text');

    await user.keyboard('{Enter}');
    expect(onSubmitApiKey).toHaveBeenCalledWith('sk-secret', 'apiKey');
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('copies discovered configuration JSON when clipboard is available', async () => {
    const user = userEvent.setup();

    render(
      <ConfigAgentChat
        messages={baseMessages}
        isLoading={false}
        onSendMessage={vi.fn()}
        onSelectOption={vi.fn()}
        onSubmitApiKey={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Copy JSON' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument(),
    );
  });

  it('does not submit empty or loading inputs', async () => {
    const onSendMessage = vi.fn();

    render(
      <ConfigAgentChat
        messages={baseMessages}
        isLoading
        onSendMessage={onSendMessage}
        onSelectOption={vi.fn()}
        onSubmitApiKey={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[buttons.length - 1]).toBeDisabled();
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});
