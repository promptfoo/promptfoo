import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from '../../hooks/useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from '../../hooks/useRedTeamTargetConfigValidation';
import TargetConfiguration from './TargetConfiguration';

import type { Config } from '../../types';

vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: () => ({ recordEvent: vi.fn() }) }));
vi.mock('@app/utils/api', () => ({ callApi: vi.fn() }));
vi.mock('../Prompts', () => ({ default: () => null }));
vi.mock('./CommonConfigurationOptions', () => ({ default: () => null }));
vi.mock('react-simple-code-editor', () => ({
  default: ({ value, onValueChange }: any) => (
    <textarea
      data-testid="code-editor"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    />
  ),
}));

function TargetConfigurationHarness({ onNext = vi.fn() }: { onNext?: () => void }) {
  const { targetConfigRevision } = useRedTeamTargetConfigValidation();
  return (
    <TooltipProvider>
      <TargetConfiguration key={targetConfigRevision} onNext={onNext} onBack={vi.fn()} />
    </TooltipProvider>
  );
}

const replaceText = async (
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
  value: string,
) => {
  await user.click(element);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(0, element.value.length);
  }
  await user.paste(value);
};

describe('TargetConfiguration lifecycle validation', () => {
  beforeEach(() => {
    act(() => {
      useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
      useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
      useRedTeamConfig.setState({
        config: {
          ...useRedTeamConfig.getState().config,
          target: {
            id: 'openinterpreter',
            label: 'Coding target',
            config: { sandbox_mode: 'danger-full-access' },
          },
        },
        providerType: 'openinterpreter',
      });
    });
  });

  it('uses an imported target after malformed JSON instead of restoring the previous target', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<TargetConfigurationHarness onNext={onNext} />);

    await replaceText(user, screen.getByTestId('code-editor'), '{"sandbox_mode":"read-only",}');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );

    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Imported target',
          config: { sandbox_mode: 'read-only' },
        },
      });
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
    expect(screen.getByTestId('code-editor')).toHaveValue(
      JSON.stringify({ sandbox_mode: 'read-only' }, null, 2),
    );

    await replaceText(user, screen.getByLabelText(/Target ID/i), 'openinterpreter:local');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'openinterpreter:local',
      label: 'Imported target',
      config: { sandbox_mode: 'read-only' },
    });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('keeps Next disabled when the target editor remounts with malformed JSON', async () => {
    const user = userEvent.setup();
    const first = render(<TargetConfigurationHarness />);

    await replaceText(user, screen.getByTestId('code-editor'), '{"sandbox_mode":"read-only",}');
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    first.unmount();

    render(<TargetConfigurationHarness />);

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  it('refreshes the raw editor when a same-type target is imported without an existing error', () => {
    render(<TargetConfigurationHarness />);

    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Imported target',
          config: { sandbox_mode: 'read-only' },
        },
      });
    });

    expect(screen.getByTestId('code-editor')).toHaveValue(
      JSON.stringify({ sandbox_mode: 'read-only' }, null, 2),
    );
    expect(useRedTeamConfig.getState().config.target.config).toEqual({
      sandbox_mode: 'read-only',
    });
  });

  it('keeps the target editor mounted and focused across consecutive valid JSON keystrokes', async () => {
    const user = userEvent.setup();
    act(() => {
      useRedTeamConfig.setState({
        config: {
          ...useRedTeamConfig.getState().config,
          target: {
            id: 'openinterpreter',
            label: 'Coding target',
            config: { max_iterations: 1 },
          },
        },
        providerType: 'openinterpreter',
      });
    });
    const revision = useRedTeamTargetConfigValidation.getState().targetConfigRevision;
    const clearTargetConfigValidation = vi.spyOn(
      useRedTeamTargetConfigValidation.getState(),
      'clearTargetConfigValidation',
    );
    render(<TargetConfigurationHarness />);
    const editor = screen.getByTestId('code-editor') as HTMLTextAreaElement;
    const caret = editor.value.indexOf('1') + 1;
    editor.focus();
    editor.setSelectionRange(caret, caret);

    await user.keyboard('23');

    expect(useRedTeamConfig.getState().config.target.config.max_iterations).toBe(123);
    expect(useRedTeamTargetConfigValidation.getState().targetConfigRevision).toBe(revision);
    expect(clearTargetConfigValidation).not.toHaveBeenCalled();
    expect(editor).toHaveFocus();
    expect(editor.isConnected).toBe(true);
  });

  it.each([
    ['HTTP', 'http', /^URL/i, 'https://example.test/chat'],
    ['HTTP URL provider', 'http://api.example.test', /^URL/i, 'https://example.test/chat'],
    ['HTTPS URL provider', 'https://api.example.test', /^URL/i, 'https://example.test/chat'],
    ['WebSocket', 'websocket', /WebSocket URL/i, 'wss://example.test/chat'],
    ['WSS URL provider', 'wss://socket.example.test', /WebSocket URL/i, 'wss://example.test/chat'],
  ])('keeps the %s editor mounted and focused while correcting an imported null config', async (_case, id, label, value) => {
    const user = userEvent.setup();
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id,
          label: `Imported ${id} target`,
          config: null as unknown as Config['target']['config'],
        },
      });
    });
    const revision = useRedTeamTargetConfigValidation.getState().targetConfigRevision;
    render(<TargetConfigurationHarness />);
    const url = screen.getByRole('textbox', { name: label }) as HTMLInputElement;

    await user.click(url);
    if (/^(?:https?|wss?):\/\//i.test(id)) {
      url.setSelectionRange(0, url.value.length);
    }

    await user.type(url, value.slice(0, 1), { skipClick: true });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigRevision).toBe(revision);
    expect(url).toHaveFocus();

    await user.type(url, value.slice(1));

    expect(useRedTeamConfig.getState().config.target.config.url).toBe(value);
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigRevision).toBe(revision);
    expect(url).toHaveFocus();
    expect(url.isConnected).toBe(true);

    if (id.startsWith('http')) {
      const [requestBody] = screen.getAllByTestId('code-editor');
      await replaceText(user, requestBody, '{"message":"{{prompt}}"}');
      expect(useRedTeamConfig.getState().config.target.config.body).toBe(
        '{"message":"{{prompt}}"}',
      );
    } else {
      const messageTemplate = screen.getByRole('textbox', { name: /Message Template/i });
      const timeout = screen.getByRole('spinbutton', { name: /Timeout \(ms\)/i });
      await replaceText(user, messageTemplate, 'Hello {{prompt}}');
      await user.click(timeout);
      await user.keyboard('25000');
      expect(useRedTeamConfig.getState().config.target.config.messageTemplate).toBe(
        'Hello {{prompt}}',
      );
      expect(useRedTeamConfig.getState().config.target.config.timeoutMs).toBe(25000);
    }

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
  });

  it('keeps a restored unsafe config blocked through whitespace and Format until it is changed', async () => {
    const user = userEvent.setup();
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    render(<TargetConfigurationHarness />);

    const editor = screen.getByTestId('code-editor');
    const unchanged = JSON.stringify({ sandbox_mode: 'danger-full-access' }, null, 2);
    expect(editor).toHaveValue(unchanged);
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    await replaceText(user, editor, `${unchanged}\n `);
    await replaceText(user, editor, ` ${unchanged}\n`);
    await user.click(screen.getByRole('button', { name: /Format/i }));

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamConfig.getState().config.target.config).toEqual({
      sandbox_mode: 'danger-full-access',
    });
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    await replaceText(user, editor, '{"sandbox_mode":"read-only"}');

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamConfig.getState().config.target.config).toEqual({
      sandbox_mode: 'read-only',
    });
    expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
  });

  it('clears a malformed draft when undo restores the last valid target configuration', async () => {
    const user = userEvent.setup();
    render(<TargetConfigurationHarness />);
    const editor = screen.getByTestId('code-editor');
    const original = JSON.stringify({ sandbox_mode: 'danger-full-access' }, null, 2);

    await replaceText(user, editor, '{"sandbox_mode":"read-only",}');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    await replaceText(user, editor, original);

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(screen.getByRole('button', { name: /Next/i })).toBeEnabled();
  });

  it.each([
    ['HTTP', 'http', /Use Raw HTTP Request/i],
    ['WebSocket', 'websocket', /Custom WebSocket Endpoint Configuration/i],
    ['browser', 'browser', /Browser Automation Configuration/i],
  ])('renders an imported %s target with null config without unblocking it', (_case, id, heading) => {
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id,
          label: `${id} target`,
          config: null as unknown as Config['target']['config'],
        },
      });
    });

    render(<TargetConfigurationHarness />);

    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(useRedTeamConfig.getState().config.target.config).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('null');
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  it('recovers an imported foundation target after a structured field replaces its null config', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openai:gpt-5',
          label: 'Foundation target',
          config: null as unknown as Config['target']['config'],
        },
      });
    });
    render(<TargetConfigurationHarness onNext={onNext} />);
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();

    await replaceText(user, screen.getByLabelText(/Model ID/i), 'openai:gpt-5-mini');

    expect(useRedTeamConfig.getState().config.target).toEqual({
      id: 'openai:gpt-5-mini',
      label: 'Foundation target',
      config: {},
    });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    const next = screen.getByRole('button', { name: /Next/i });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'HTTP URL target',
      'https://example.test/generate',
      { method: 'POST', body: '{"message":"{{prompt}}"}' },
    ],
    ['WebSocket URL target', 'wss://example.test/socket', { messageTemplate: '{{prompt}}' }],
  ])('allows a valid imported %s whose endpoint is stored in the provider ID', async (_case, id, targetConfig) => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: { id, label: 'Imported URL target', config: targetConfig },
      });
    });
    render(<TargetConfigurationHarness onNext={onNext} />);

    expect(
      screen.getByRole('textbox', { name: id.startsWith('wss://') ? /WebSocket URL/i : /^URL/i }),
    ).toHaveValue(id);
    const next = screen.getByRole('button', { name: /Next/i });
    expect(next).toBeEnabled();
    await user.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'HTTP',
      'https://old.example/chat',
      { method: 'POST', body: '{{prompt}}' },
      /^URL/i,
      'https://new.example/chat',
    ],
    [
      'WebSocket',
      'wss://old.example/socket',
      { messageTemplate: '{{prompt}}' },
      /WebSocket URL/i,
      'wss://new.example/socket',
    ],
  ])('allows an imported %s URL target to clear and replace its endpoint', async (_case, id, config, label, nextUrl) => {
    const user = userEvent.setup();
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: { id, label: 'Imported URL target', config },
      });
    });
    render(<TargetConfigurationHarness />);

    const input = screen.getByRole('textbox', { name: label });
    expect(input).toHaveValue(id);
    await user.clear(input);
    expect(input).toHaveValue('');
    await user.type(input, nextUrl);

    expect(useRedTeamConfig.getState().config.target.config.url).toBe(nextUrl);
  });

  it.each([
    ['without config.url', { method: 'POST', body: '{"message":"{{prompt}}"}' }],
    ['with an empty config.url', { url: '', method: 'POST', body: '{"message":"{{prompt}}"}' }],
  ])('keeps an imported HTTP URL target visible and testable %s', (_case, config) => {
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'https://example.test/generate',
          label: 'Imported URL target',
          config,
        },
      });
    });
    render(<TargetConfigurationHarness />);

    expect(screen.getByLabelText(/^URL/i)).toHaveValue('https://example.test/generate');
    expect(screen.getByRole('button', { name: /Test Target/i })).toBeEnabled();
    expect(
      screen.queryByText(/Please configure the target URL or request before testing/i),
    ).toBeNull();
  });

  it('blocks every HTTP test action while a preserved target configuration is invalid', async () => {
    const user = userEvent.setup();
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'http',
          label: 'Blocked target',
          config: {
            url: 'https://example.test/chat',
            method: 'POST',
            body: '{{prompt}}',
            stateful: true,
            transformRequest: 'return prompt',
            transformResponse: 'return json',
          },
        },
      });
    });
    render(<TargetConfigurationHarness />);
    act(() => {
      useRedTeamTargetConfigValidation
        .getState()
        .setTargetConfigError('Invalid JSON configuration');
    });

    expect(screen.getByRole('button', { name: /Test Target/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Test Session/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Test$/i })).toBeDisabled();
    await user.click(screen.getByRole('tab', { name: /Request Transform/i }));
    expect(screen.getAllByRole('button', { name: /^Test$/i })).toSatisfy((buttons: HTMLElement[]) =>
      buttons.every((button) => button.hasAttribute('disabled')),
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  it.each([
    [
      'enabling',
      {
        url: 'wss://example.test/socket',
        messageTemplate: '{{prompt}}',
        transformResponse: 'data.message',
      },
      'streamResponse',
      'transformResponse',
    ],
    [
      'disabling',
      {
        url: 'wss://example.test/socket',
        messageTemplate: '{{prompt}}',
        streamResponse: '(acc, event) => [acc, true]',
      },
      'transformResponse',
      'streamResponse',
    ],
  ])('persists both WebSocket config updates when %s streaming', async (_case, targetConfig, populatedField, clearedField) => {
    const user = userEvent.setup();
    act(() => {
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: { id: 'websocket', label: 'WebSocket target', config: targetConfig },
      });
    });
    render(<TargetConfigurationHarness />);

    await user.click(screen.getByRole('switch', { name: /Stream Response/i }));

    expect(useRedTeamConfig.getState().config.target.config[populatedField]).toEqual(
      expect.any(String),
    );
    expect(useRedTeamConfig.getState().config.target.config[clearedField]).toBeUndefined();
  });

  it.each([
    ['foundation', 'openai:gpt-5', 'openai'],
    ['browser', 'browser', 'browser'],
  ])('keeps a markerless %s target with null config blocked', (_case, id, providerType) => {
    act(() => {
      useRedTeamConfig.setState({
        config: {
          ...useRedTeamConfig.getState().config,
          target: {
            id,
            label: `${id} target`,
            config: null as unknown as Config['target']['config'],
          },
        },
        providerType,
      });
      useRedTeamTargetConfigValidation.setState({
        ...useRedTeamTargetConfigValidation.getState(),
        targetConfigError: null,
        targetConfigDraft: null,
      });
      window.localStorage.removeItem('redTeamTargetConfigValidation');
    });

    render(<TargetConfigurationHarness />);

    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });
});
