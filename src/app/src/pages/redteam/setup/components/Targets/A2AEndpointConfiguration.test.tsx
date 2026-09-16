import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import A2AEndpointConfiguration from './A2AEndpointConfiguration';

import type { ProviderOptions } from '../../types';

vi.mock('react-simple-code-editor', () => ({
  default: ({ highlight, placeholder, value, onValueChange }: any) => {
    highlight?.(value);

    return (
      <textarea
        data-testid="code-editor"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
    );
  },
}));

const render = (ui: React.ReactElement) => {
  return rtlRender(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
};

const renderA2AConfiguration = (
  initialTarget: ProviderOptions,
  rawConfig = JSON.stringify({}, null, 2),
  bodyError: string | React.ReactNode | null = null,
) => {
  const updateSpy = vi.fn();
  const setRawConfigJsonSpy = vi.fn();
  const onAdvancedConfigErrorChangeSpy = vi.fn();

  const Harness = () => {
    const [target, setTarget] = React.useState(initialTarget);
    const [rawConfigJson, setRawConfigJson] = React.useState(rawConfig);

    const updateCustomTarget = (field: string, value: unknown) => {
      updateSpy(field, value);
      setTarget((currentTarget) => {
        if (field === 'id') {
          return { ...currentTarget, id: value as string };
        }

        if (field === 'config') {
          return { ...currentTarget, config: value as ProviderOptions['config'] };
        }

        return {
          ...currentTarget,
          config: {
            ...(currentTarget.config ?? {}),
            [field]: value,
          },
        };
      });
    };

    const setRawConfigJsonWithSpy = (value: string) => {
      setRawConfigJsonSpy(value);
      setRawConfigJson(value);
    };

    return (
      <A2AEndpointConfiguration
        selectedTarget={target}
        updateCustomTarget={updateCustomTarget}
        rawConfigJson={rawConfigJson}
        setRawConfigJson={setRawConfigJsonWithSpy}
        bodyError={bodyError}
        onAdvancedConfigErrorChange={onAdvancedConfigErrorChangeSpy}
      />
    );
  };

  render(<Harness />);

  return { updateSpy, setRawConfigJsonSpy, onAdvancedConfigErrorChangeSpy };
};

describe('A2AEndpointConfiguration', () => {
  it('should render friendly A2A connection, auth, and advanced fields', async () => {
    const user = userEvent.setup();
    const { updateSpy } = renderA2AConfiguration({
      id: 'a2a',
      config: {
        url: '',
      },
    });

    const agentCardUrlInput = screen.getByLabelText(/Agent Card URL/i);
    const endpointUrlInput = screen.getByLabelText(/A2A Endpoint URL/i);

    expect(agentCardUrlInput).toBeInTheDocument();
    expect(endpointUrlInput).toBeInTheDocument();
    expect(
      agentCardUrlInput.compareDocumentPosition(endpointUrlInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByLabelText(/Request Mode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Enable polling/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Authentication Type/i)).toBeInTheDocument();
    expect(screen.getByText(/Advanced Configuration \(JSON\)/i)).toBeInTheDocument();

    await user.type(endpointUrlInput, 'https://agent.example.com/a2a');
    expect(updateSpy).toHaveBeenCalledWith('url', 'https://agent.example.com/a2a');

    await user.click(screen.getByLabelText(/Authentication Type/i));
    await user.click(screen.getByRole('option', { name: 'Bearer Token' }));
    expect(updateSpy).toHaveBeenCalledWith('auth', { type: 'bearer', token: '' });

    await user.click(screen.getByPlaceholderText('{{A2A_API_KEY}}'));
    await user.paste('{{A2A_API_KEY}}');
    await waitFor(() => {
      expect(updateSpy).toHaveBeenLastCalledWith('auth', {
        type: 'bearer',
        token: '{{A2A_API_KEY}}',
      });
    });
  });

  it('should update structured connection fields and show examples', async () => {
    const user = userEvent.setup();
    const { setRawConfigJsonSpy, updateSpy } = renderA2AConfiguration({
      id: 'a2a',
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
        mode: 'send',
      },
    });

    await waitFor(() => {
      expect(setRawConfigJsonSpy).toHaveBeenCalledWith(JSON.stringify({ mode: 'send' }, null, 2));
    });

    await user.clear(screen.getByLabelText(/Provider ID/i));
    await user.paste('a2a:https://agent.example.com/a2a/v1');
    expect(updateSpy).toHaveBeenCalledWith('id', 'a2a:https://agent.example.com/a2a/v1');

    await user.clear(screen.getByLabelText(/Agent Card URL/i));
    await user.paste('https://new-agent.example.com/.well-known/agent-card.json');
    expect(updateSpy).toHaveBeenCalledWith(
      'agentCardUrl',
      'https://new-agent.example.com/.well-known/agent-card.json',
    );

    expect(screen.queryByText(/Endpoint shorthand/i)).not.toBeInTheDocument();
    await user.click(screen.getByText('Examples'));
    expect(screen.getByText(/Endpoint shorthand/i)).toBeInTheDocument();
    expect(screen.getByText(/JSON Config Example/i)).toBeInTheDocument();
  });

  it('should use an expression-style transformResponse in the advanced config placeholder', () => {
    renderA2AConfiguration({
      id: 'a2a',
      config: {
        url: '',
      },
    });

    const placeholder = screen.getByTestId('code-editor').getAttribute('placeholder') ?? '';

    expect(placeholder).toContain(
      '"transformResponse": "result.output || result.message || JSON.stringify(result.raw)"',
    );
    expect(placeholder).not.toContain('"transformResponse": "return ');
  });

  it('should configure basic and API key auth fields', async () => {
    const user = userEvent.setup();
    const { updateSpy } = renderA2AConfiguration({
      id: 'a2a',
      config: {},
    });

    await user.click(screen.getByLabelText(/Authentication Type/i));
    await user.click(screen.getByRole('option', { name: 'Basic Auth' }));
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'basic',
      username: '',
      password: '',
    });

    await user.type(screen.getByLabelText(/Username/i), 'agent-user');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'basic',
      username: 'agent-user',
      password: '',
    });

    await user.type(screen.getByLabelText(/Password/i, { selector: 'input' }), 'secret');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'basic',
      username: 'agent-user',
      password: 'secret',
    });

    await user.click(screen.getByRole('button', { name: /Show password/i }));
    expect(screen.getByLabelText(/Password/i, { selector: 'input' })).toHaveAttribute(
      'type',
      'text',
    );

    await user.click(screen.getByLabelText(/Authentication Type/i));
    await user.click(screen.getByRole('option', { name: 'API Key' }));
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'api_key',
      keyName: 'X-API-Key',
      placement: 'header',
      value: '',
    });

    await user.click(screen.getByLabelText(/Placement/i));
    await user.click(screen.getByRole('option', { name: 'Query Parameter' }));
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'api_key',
      keyName: 'X-API-Key',
      placement: 'query',
      value: '',
    });

    await user.clear(screen.getByLabelText(/Key Name/i));
    await user.paste('api_key');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'api_key',
      keyName: 'api_key',
      placement: 'query',
      value: '',
    });

    await user.click(screen.getByLabelText(/API Key Value/i, { selector: 'input' }));
    await user.paste('{{A2A_API_KEY}}');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'api_key',
      keyName: 'api_key',
      placement: 'query',
      value: '{{A2A_API_KEY}}',
    });
  });

  it('should configure OAuth auth fields and clear auth when no auth is selected', async () => {
    const user = userEvent.setup();
    const { updateSpy } = renderA2AConfiguration({
      id: 'a2a',
      config: {},
    });

    await user.click(screen.getByLabelText(/Authentication Type/i));
    await user.click(screen.getByRole('option', { name: 'OAuth 2.0' }));
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'client_credentials',
      tokenUrl: '',
      clientId: '',
      clientSecret: '',
      scopes: [],
    });

    await user.type(screen.getByLabelText(/Token URL/i), 'https://agent.example.com/oauth/token');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'client_credentials',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '',
      clientSecret: '',
      scopes: [],
    });

    await user.click(screen.getByLabelText(/Client ID/i));
    await user.paste('{{A2A_CLIENT_ID}}');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'client_credentials',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '{{A2A_CLIENT_ID}}',
      clientSecret: '',
      scopes: [],
    });

    await user.click(screen.getByLabelText(/Client Secret/i, { selector: 'input' }));
    await user.paste('{{A2A_CLIENT_SECRET}}');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'client_credentials',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '{{A2A_CLIENT_ID}}',
      clientSecret: '{{A2A_CLIENT_SECRET}}',
      scopes: [],
    });

    await user.click(screen.getByLabelText(/Grant Type/i));
    await user.click(screen.getByRole('option', { name: 'Username & Password' }));
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'password',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '{{A2A_CLIENT_ID}}',
      clientSecret: '{{A2A_CLIENT_SECRET}}',
      scopes: [],
      username: '',
      password: '',
    });

    await user.type(screen.getByLabelText(/^Username/i), 'oauth-user');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'password',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '{{A2A_CLIENT_ID}}',
      clientSecret: '{{A2A_CLIENT_SECRET}}',
      scopes: [],
      username: 'oauth-user',
      password: '',
    });

    await user.type(screen.getByLabelText(/^Password/i, { selector: 'input' }), 'oauth-password');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'password',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '{{A2A_CLIENT_ID}}',
      clientSecret: '{{A2A_CLIENT_SECRET}}',
      scopes: [],
      username: 'oauth-user',
      password: 'oauth-password',
    });

    await user.clear(screen.getByLabelText(/Scopes/i));
    await user.paste('agent:invoke, tasks:read, ');
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'password',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '{{A2A_CLIENT_ID}}',
      clientSecret: '{{A2A_CLIENT_SECRET}}',
      scopes: ['agent:invoke', 'tasks:read'],
      username: 'oauth-user',
      password: 'oauth-password',
    });

    await user.click(screen.getByLabelText(/Grant Type/i));
    await user.click(screen.getByRole('option', { name: 'Client Credentials' }));
    expect(updateSpy).toHaveBeenLastCalledWith('auth', {
      type: 'oauth',
      grantType: 'client_credentials',
      tokenUrl: 'https://agent.example.com/oauth/token',
      clientId: '{{A2A_CLIENT_ID}}',
      clientSecret: '{{A2A_CLIENT_SECRET}}',
      scopes: ['agent:invoke', 'tasks:read'],
    });

    await user.click(screen.getByLabelText(/Authentication Type/i));
    await user.click(screen.getByRole('option', { name: 'No Auth' }));
    expect(updateSpy).toHaveBeenLastCalledWith('auth', undefined);
  });

  it('should merge advanced JSON under structured A2A fields', async () => {
    const user = userEvent.setup();
    const { updateSpy } = renderA2AConfiguration(
      {
        id: 'a2a',
        config: {
          url: 'https://agent.example.com/a2a',
          auth: { type: 'bearer', token: '{{A2A_API_KEY}}' },
        },
      },
      '{}',
    );

    const advancedConfig = {
      mode: 'stream',
      tenant: 'acme',
      protocolVersion: '1.0',
      polling: {
        enabled: false,
        intervalMs: 2000,
        timeoutMs: 120000,
      },
      headers: {
        'X-Trace-Id': '{{traceId}}',
      },
      transformResponse: 'text',
    };

    const editor = screen.getByTestId('code-editor');
    await user.clear(editor);
    await user.paste(JSON.stringify(advancedConfig, null, 2));

    await waitFor(() => {
      expect(updateSpy).toHaveBeenLastCalledWith('config', {
        ...advancedConfig,
        url: 'https://agent.example.com/a2a',
        auth: { type: 'bearer', token: '{{A2A_API_KEY}}' },
      });
    });
  });

  it('should format advanced JSON and keep structured fields when formatting succeeds', async () => {
    const user = userEvent.setup();
    const { setRawConfigJsonSpy, updateSpy } = renderA2AConfiguration({
      id: 'a2a',
      config: {
        url: 'https://agent.example.com/a2a',
      },
    });

    const editor = screen.getByTestId('code-editor');
    await user.clear(editor);
    await user.paste('{"mode":"stream","polling":{"enabled":false}}');
    setRawConfigJsonSpy.mockClear();
    updateSpy.mockClear();

    await user.click(screen.getByRole('button', { name: /Format/i }));

    const expectedConfig = {
      mode: 'stream',
      polling: { enabled: false },
    };
    expect(setRawConfigJsonSpy).toHaveBeenLastCalledWith(JSON.stringify(expectedConfig, null, 2));
    expect(updateSpy).toHaveBeenLastCalledWith('config', {
      ...expectedConfig,
      url: 'https://agent.example.com/a2a',
    });
  });

  it('should require advanced configuration to be a JSON object', async () => {
    const user = userEvent.setup();
    const { onAdvancedConfigErrorChangeSpy, updateSpy } = renderA2AConfiguration({
      id: 'a2a',
      config: {
        url: 'https://agent.example.com/a2a',
      },
    });

    updateSpy.mockClear();
    onAdvancedConfigErrorChangeSpy.mockClear();

    const editor = screen.getByTestId('code-editor');
    await user.clear(editor);
    await user.paste('[]');

    await waitFor(() => {
      expect(screen.getByText('Advanced configuration must be a JSON object')).toBeInTheDocument();
      expect(onAdvancedConfigErrorChangeSpy).toHaveBeenLastCalledWith(
        'Advanced configuration must be a JSON object',
      );
    });
    expect(updateSpy).not.toHaveBeenCalledWith('config', expect.anything());
  });

  it('should show body errors and disable JSON formatting while they are present', () => {
    renderA2AConfiguration(
      {
        id: 'a2a',
        config: {
          url: 'https://agent.example.com/a2a',
        },
      },
      '{"mode":"send"}',
      'Request body must contain {{prompt}}',
    );

    expect(screen.getByText('Request body must contain {{prompt}}')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Format/i })).toBeDisabled();
  });

  it('should report malformed advanced JSON without saving stale config', async () => {
    const user = userEvent.setup();
    const { updateSpy, onAdvancedConfigErrorChangeSpy } = renderA2AConfiguration(
      {
        id: 'a2a',
        config: {
          url: 'https://agent.example.com/a2a',
          mode: 'send',
        },
      },
      JSON.stringify({ mode: 'send' }, null, 2),
    );

    updateSpy.mockClear();
    onAdvancedConfigErrorChangeSpy.mockClear();

    const editor = screen.getByTestId('code-editor');
    await user.clear(editor);
    await user.paste('{');

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON configuration')).toBeInTheDocument();
      expect(onAdvancedConfigErrorChangeSpy).toHaveBeenLastCalledWith('Invalid JSON configuration');
    });
    expect(updateSpy).not.toHaveBeenCalledWith('config', expect.anything());
  });
});
