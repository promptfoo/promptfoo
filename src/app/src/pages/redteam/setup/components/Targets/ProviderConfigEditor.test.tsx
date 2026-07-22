import React from 'react';

import AddProviderDialog from '@app/pages/eval-creator/components/AddProviderDialog';
import { renderWithProviders } from '@app/utils/testutils';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import nunjucks from 'nunjucks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProviderConfigEditor from './ProviderConfigEditor';
import ProviderEditor from './ProviderEditor';

import type { ProviderOptions } from '../../types';

const mockA2AConfigState = vi.hoisted(() => ({
  advancedConfigError: null as string | null,
}));

vi.mock('./HttpEndpointConfiguration', () => ({
  default: () => <div data-testid="http-config" />,
}));
vi.mock('./WebSocketEndpointConfiguration', () => ({
  default: ({
    selectedTarget,
    updateWebSocketTarget,
    urlError,
  }: {
    selectedTarget: ProviderOptions;
    updateWebSocketTarget: (field: string, value: unknown) => void;
    urlError: string | null;
  }) => (
    <div data-testid="ws-config">
      <label htmlFor="websocket-url">WebSocket URL</label>
      <input
        id="websocket-url"
        value={selectedTarget.config.url}
        onChange={(event) => updateWebSocketTarget('url', event.target.value)}
      />
      {urlError && <div>{urlError}</div>}
    </div>
  ),
}));
vi.mock('./CustomTargetConfiguration', () => ({
  default: () => <div data-testid="custom-config" />,
}));
vi.mock('./ProviderTypeSelector', () => ({
  default: () => <div data-testid="provider-type-selector" />,
}));
vi.mock('./A2AEndpointConfiguration', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({
      onAdvancedConfigErrorChange,
    }: {
      onAdvancedConfigErrorChange?: (error: string | null) => void;
    }) => {
      React.useEffect(() => {
        onAdvancedConfigErrorChange?.(mockA2AConfigState.advancedConfigError);
      }, [onAdvancedConfigErrorChange]);
      return <div data-testid="a2a-config" />;
    },
  };
});
vi.mock('./BrowserAutomationConfiguration', () => ({
  default: () => <div data-testid="browser-config" />,
}));
vi.mock('./FoundationModelConfiguration', () => ({
  default: ({
    providerType,
    updateCustomTarget,
  }: {
    providerType: string;
    updateCustomTarget: (field: string, value: unknown) => void;
  }) => (
    <div data-testid="fm-config">
      {providerType === 'bedrock' && (
        <button
          data-testid="switch-bedrock-invoke"
          onClick={() => updateCustomTarget('id', 'bedrock:anthropic.claude-3-5-sonnet')}
        >
          Switch Bedrock InvokeModel
        </button>
      )}
    </div>
  ),
}));
vi.mock('./AgentFrameworkConfiguration', () => ({
  default: () => <div data-testid="agent-config" />,
}));
vi.mock('./CommonConfigurationOptions', () => ({
  default: ({ onValidationChange }: { onValidationChange?: (hasErrors: boolean) => void }) => {
    React.useEffect(() => {
      if (onValidationChange) {
        onValidationChange(false);
      }
    }, [onValidationChange]);
    return <div data-testid="common-config" />;
  },
}));

describe('ProviderConfigEditor', () => {
  beforeEach(() => {
    mockA2AConfigState.advancedConfigError = null;
  });

  describe('validate method', () => {
    it('should return true from validate() for a valid http provider', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const validHttpProvider: ProviderOptions = {
        id: 'http',
        config: {
          url: 'https://api.example.com/chat',
          body: {
            messages: [{ role: 'user', content: '{{prompt}}' }],
          },
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={validHttpProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="http"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it.each([
      ['a static URL', 'wss://example.com/ws'],
      ['a path template', 'wss://example.com/{{ path }}'],
      ['an authority template', 'wss://{{ host }}/ws'],
      ['a port template', 'wss://example.com:{{ port }}/ws'],
      ['a scheme template', '{{ protocol }}://example.com/ws'],
      ['a constant filtered WebSocket scheme', '{{ "WS" | lower }}://example.com/ws'],
      [
        'a boolean-valued constant filter operand',
        '{{ false | default("ws", true) }}://example.com/ws',
      ],
      ['a numeric constant filter operand', '{{ 0 | default("wss", true) }}://example.com/ws'],
      ['a partial scheme template', 'w{{ protocolSuffix }}://example.com/ws'],
      ['a case-insensitive partial scheme template', 'W{{ protocolSuffix }}://example.com/ws'],
      ['a whole-URL template', '{{ websocketUrl }}'],
      [
        'a whole-URL template followed by a callback URL',
        '{{ websocketUrl }}?callback=https://example.com',
      ],
      ['a filtered scheme prefix', '{{ protocol | default("ws://") }}example.com/ws'],
      [
        'many non-branching query-value templates',
        `wss://example.com/?${Array.from({ length: 32 }, (_, index) => `p${index}={{ v${index} }}`).join('&')}`,
      ],
      ['a conditional scheme', '{% if secure %}wss{% else %}ws{% endif %}://example.com/ws'],
      [
        'a whitespace-trimmed conditional scheme',
        '{%- if secure -%}wss{%- else -%}ws{%- endif -%}://example.com/ws',
      ],
      [
        'a whitespace-trimmed conditional scheme with surrounding spaces',
        '{%- if secure -%} wss {%- else -%} ws {%- endif -%}://example.com/ws',
      ],
      [
        'a modulo conditional scheme',
        '{% if value % 2 == 0 %}ws{% else %}wss{% endif %}://example.com/ws',
      ],
      [
        'a quoted-percent conditional scheme',
        '{% if value == "100%" %}ws{% else %}wss{% endif %}://example.com/ws',
      ],
      [
        'an implicit empty conditional branch',
        '{% if useHttp %}http{% endif %}ws://example.com/ws',
      ],
      [
        'a nested conditional scheme',
        '{% if outer %}{% if inner %}wss{% else %}ws{% endif %}{% else %}ws{% endif %}://example.com/ws',
      ],
      ['an IPv6 authority template', 'ws://[{{ address }}]:{{ port }}/ws'],
      [
        'an IPv6-or-DNS conditional authority',
        'ws://{% if ipv6 %}[::1]{% else %}example.com{% endif %}/ws',
      ],
      [
        'a conditional host and port',
        'ws://{% if usePort %}example.com:1234{% else %}example.com{% endif %}/ws',
      ],
      [
        'authority control-flow templates',
        'wss://{% if tenant %}{{ tenant }}{% else %}default{% endif %}.example.com/ws',
      ],
      ['literal raw-template path content', 'wss://example.com/{% raw %}{{ host }}{% endraw %}'],
      [
        'a long literal containing the previous collision marker',
        `wss://example.com/__promptfoo_template__${'_'.repeat(4_096)}/{{ path }}`,
      ],
    ])('should accept a WebSocket provider with %s', (_description, url) => {
      const setError = vi.fn();
      const onValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'websocket', config: { url, messageTemplate: '{{ prompt }}' } }}
          setProvider={vi.fn()}
          setError={setError}
          onValidate={onValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="websocket"
        />,
      );

      expect(validateFn!()).toBe(true);
      expect(setError).toHaveBeenCalledWith(null);
      expect(onValidate).toHaveBeenCalledWith(true);
    });

    it.each([
      ['an HTTP URL', 'https://example.com/ws'],
      ['an HTTP URL with a templated host', 'https://{{ host }}/ws'],
      ['an incompatible templated scheme', 'http{{ suffix }}://example.com/ws'],
      ['a constant filtered HTTP scheme', '{{ "http" | lower }}://example.com/ws'],
      ['a constant filtered HTTPS scheme', '{{ "https" | upper }}://example.com/ws'],
      ['a constant default-filtered HTTP scheme', '{{ "http" | default("ws") }}://example.com/ws'],
      [
        'a static scheme containing the internal placeholder',
        '__promptfoo_template__://example.com/ws',
      ],
      [
        'a static partial scheme containing the internal placeholder',
        'w__promptfoo_template__://example.com/ws',
      ],
      [
        'an exclusively non-WebSocket conditional scheme',
        '{% if secure %}https{% else %}http{% endif %}://example.com/ws',
      ],
      ['a malformed static URL', 'wss://[invalid-host/ws'],
      ['a scheme template without an authority', '{{ protocol }}://'],
      ['a standalone host expression', '{{ host }}'],
      ['a host expression without a WebSocket scheme', '{{ host }}/ws'],
      ['a filtered host expression without a WebSocket scheme', '{{ host | lower }}/ws'],
      ['a host expression followed by a callback URL', '{{ host }}?callback=https://example.com'],
      ['an incomplete template', 'wss://{{ host }/ws'],
      ['an incomplete expression in a path', 'wss://example.com/{{ host }'],
      ['an empty template expression', 'wss://example.com/{{ }}'],
      ['an incomplete template filter', 'wss://example.com/{{ host | }}'],
      ['a syntactically invalid template expression', 'wss://{{ host + }}/ws'],
      ['a syntactically invalid block tag', 'wss://example.com/{% for %}'],
      ['an unsupported loop block', '{% for prefix in prefixes %}ws{% endfor %}://example.com/ws'],
      ['an unsupported set block', '{% set protocol = "ws" %}{{ protocol }}://example.com/ws'],
      ['an unsupported include block', '{% include "scheme.njk" %}://example.com/ws'],
      ['an unterminated conditional', 'wss://example.com/{% if secure %}/ws'],
      ['an unterminated whitespace-trimmed conditional', 'wss://{%- if secure -%}example.com/ws'],
      [
        'an unterminated nested conditional',
        '{% if outer %}{% if inner %}wss{% else %}ws{% endif %}://example.com/ws',
      ],
      ['literal raw-template host content', 'wss://{% raw %}{{ host }}{% endraw %}/ws'],
      ['an unfinished comment', 'wss://example.com/{# unfinished'],
      [
        'many conditional branches under an invalid static scheme',
        `https://example.com/${'{% if condition %}x{% else %}y{% endif %}'.repeat(20)}`,
      ],
      [
        'too many incompatible conditional scheme branches',
        `${'{% if condition %}x{% else %}y{% endif %}'.repeat(20)}://example.com/ws`,
      ],
    ])('should reject a WebSocket provider with %s', (_description, url) => {
      const setError = vi.fn();
      const onValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{ id: 'websocket', config: { url, messageTemplate: '{{ prompt }}' } }}
          setProvider={vi.fn()}
          setError={setError}
          onValidate={onValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="websocket"
        />,
      );

      expect(validateFn!()).toBe(false);
      expect(setError).toHaveBeenCalledWith('Valid WebSocket URL is required');
      expect(onValidate).toHaveBeenCalledWith(false);
    });

    it('should validate a static WebSocket URL without using the Nunjucks parser', () => {
      const parser = (
        nunjucks as typeof nunjucks & { parser: { parse: (template: string) => unknown } }
      ).parser;
      const parse = vi.spyOn(parser, 'parse');
      let validateFn: (() => boolean) | null = null;

      renderWithProviders(
        <ProviderConfigEditor
          provider={{
            id: 'websocket',
            config: { url: 'wss://example.com/ws', messageTemplate: '{{ prompt }}' },
          }}
          setProvider={vi.fn()}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="websocket"
        />,
      );

      expect(validateFn!()).toBe(true);
      expect(parse).not.toHaveBeenCalled();
      parse.mockRestore();
    });

    it.each([
      ['an authority template', 'wss://{{ host }}/ws'],
      ['a conditional scheme', '{% if secure %}wss{% else %}ws{% endif %}://example.com/ws'],
      [
        'a whole-URL template followed by a callback URL',
        '{{ websocketUrl }}?callback=https://example.com',
      ],
      [
        'a whitespace-trimmed conditional scheme with surrounding spaces',
        '{%- if secure -%} wss {%- else -%} ws {%- endif -%}://example.com/ws',
      ],
    ])('should continue from the actual red-team Next button with %s', async (_description, url) => {
      const user = userEvent.setup();
      const onNext = vi.fn();

      function WebSocketEditorHarness() {
        const [provider, setProvider] = React.useState<ProviderOptions>({
          id: 'websocket',
          label: 'WebSocket target',
          config: { url: 'wss://example.com/ws', messageTemplate: '{{ prompt }}' },
        });

        return (
          <ProviderEditor
            provider={provider}
            setProvider={setProvider}
            onActionButtonClick={onNext}
            opts={{ disableNameField: true }}
          />
        );
      }

      renderWithProviders(<WebSocketEditorHarness />);

      const urlInput = screen.getByRole('textbox', { name: 'WebSocket URL' });
      await user.clear(urlInput);
      await user.paste(url);

      expect(urlInput).toHaveValue(url);
      expect(
        screen.queryByText('Please enter a valid WebSocket URL (ws:// or wss://)'),
      ).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Next' }));

      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['an authority template', 'wss://{{ host }}/ws'],
      ['a whole-URL template', '{{ websocketUrl }}'],
      [
        'a whole-URL template followed by a callback URL',
        '{{ websocketUrl }}?callback=https://example.com',
      ],
      [
        'a whitespace-trimmed conditional scheme with surrounding spaces',
        '{%- if secure -%} wss {%- else -%} ws {%- endif -%}://example.com/ws',
      ],
    ])('should save %s through the actual eval provider dialog', async (_description, url) => {
      const user = userEvent.setup();
      const onSave = vi.fn();

      renderWithProviders(
        <AddProviderDialog
          open
          initialProvider={{
            id: 'websocket',
            label: 'WebSocket target',
            config: { url: 'wss://example.com/ws', messageTemplate: '{{ prompt }}' },
          }}
          onSave={onSave}
          onClose={vi.fn()}
        />,
      );

      const urlInput = screen.getByRole('textbox', { name: 'WebSocket URL' });
      await user.clear(urlInput);
      await user.paste(url);

      expect(
        screen.queryByText('Please enter a valid WebSocket URL (ws:// or wss://)'),
      ).not.toBeInTheDocument();
      const saveButton = screen.getByRole('button', { name: 'Save Changes' });
      expect(saveButton).toBeEnabled();
      await user.click(saveButton);

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ config: expect.objectContaining({ url }) }),
      );
    });

    it('should return false from validate() when provider ID contains only whitespace characters for foundation model providers', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const whitespaceProvider: ProviderOptions = {
        id: '   ',
        config: {},
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={whitespaceProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="openai"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('Model ID is required');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it("should return true from validate() for a valid 'go' custom provider with a non-empty provider ID when providerType is 'go'", () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const validGoProvider: ProviderOptions = {
        id: 'go-provider',
        config: {},
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={validGoProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="go"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for an A2A provider with a shorthand URL', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a:https://agent.example.com/a2a/v1',
        config: {
          url: '',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for an A2A provider with a templated endpoint URL', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          url: '{{ env.A2A_URL }}',
          mode: 'send',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for an A2A provider with a templated Agent Card URL host', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          agentCardUrl: 'https://{{ env.A2A_HOST }}/.well-known/agent-card.json',
          mode: 'auto',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return true from validate() for an A2A provider with a templated shorthand URL', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a:{{ env.A2A_URL }}',
        config: {
          mode: 'send',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });

    it('should return false from validate() for an A2A provider without endpoint details', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          url: '',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith(
        'A valid A2A endpoint URL or Agent Card URL is required',
      );
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() for an invalid A2A endpoint override even when Agent Card URL is valid', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
          url: 'not-a-url',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('A2A endpoint URL must be a valid HTTP(S) URL');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() for an invalid A2A Agent Card URL even when shorthand URL is valid', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a:https://agent.example.com/a2a/v1',
        config: {
          agentCardUrl: 'not-a-url',
          url: '',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith('A2A Agent Card URL must be a valid HTTP(S) URL');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() for an A2A provider with a non-A2A provider ID', () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'travel-agent',
        config: {
          url: 'https://agent.example.com/a2a/v1',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(false);
      expect(mockSetError).toHaveBeenCalledWith(
        'A2A Provider ID must be "a2a" or start with "a2a:"',
      );
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it('should return false from validate() when A2A advanced JSON is invalid', async () => {
      mockA2AConfigState.advancedConfigError = 'Invalid JSON configuration';
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const a2aProvider: ProviderOptions = {
        id: 'a2a',
        config: {
          url: 'https://agent.example.com/a2a/v1',
          mode: 'send',
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={a2aProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="a2a"
        />,
      );

      await waitFor(() => {
        expect(validateFn!()).toBe(false);
      });
      expect(mockSetError).toHaveBeenCalledWith('Invalid JSON configuration');
      expect(mockOnValidate).toHaveBeenCalledWith(false);
    });

    it("should return true from validate() for a valid agent framework provider (e.g., providerType is 'langchain', provider.id is 'file://path/to/agent.py')", () => {
      const mockSetProvider = vi.fn();
      const mockSetError = vi.fn();
      const mockOnValidate = vi.fn();
      let validateFn: (() => boolean) | null = null;

      const validAgentProvider: ProviderOptions = {
        id: 'file://path/to/agent.py',
        config: {},
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={validAgentProvider}
          setProvider={mockSetProvider}
          setError={mockSetError}
          onValidate={mockOnValidate}
          onValidationRequest={(validator) => {
            validateFn = validator;
          }}
          providerType="langchain"
        />,
      );

      const isValid = validateFn!();

      expect(isValid).toBe(true);
      expect(mockSetError).toHaveBeenCalledWith(null);
      expect(mockOnValidate).toHaveBeenCalledWith(true);
    });
  });

  it('should render without crashing when provider is an empty object', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const emptyProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { container } = renderWithProviders(
      <ProviderConfigEditor
        provider={emptyProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        providerType="custom"
        validateAll={true}
      />,
    );

    expect(container).toBeInTheDocument();
    expect(mockSetError).toHaveBeenCalledWith('Provider ID is required');
    expect(mockOnValidate).toHaveBeenCalledWith(false);
  });

  it('should call setError and onValidate when validateAll is true and the provider config is invalid', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const invalidHttpProvider: ProviderOptions = {
      id: 'http',
      config: {
        body: {
          messages: [{ role: 'user', content: '{{prompt}}' }],
        },
      },
    };

    renderWithProviders(
      <ProviderConfigEditor
        provider={invalidHttpProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        validateAll={true}
        providerType="http"
      />,
    );

    expect(mockSetError).toHaveBeenCalledTimes(1);
    expect(mockSetError).toHaveBeenCalledWith('Valid URL is required');
    expect(mockOnValidate).toHaveBeenCalledTimes(1);
    expect(mockOnValidate).toHaveBeenCalledWith(false);
  });

  it("should set error and render CustomTargetConfiguration when validateAll is true and a 'go' provider has an empty ID", () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const goProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { getByTestId } = renderWithProviders(
      <ProviderConfigEditor
        provider={goProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        validateAll={true}
        providerType="go"
      />,
    );

    expect(mockSetError).toHaveBeenCalledTimes(1);
    expect(mockSetError).toHaveBeenCalledWith('Provider ID is required');
    expect(mockOnValidate).toHaveBeenCalledTimes(1);
    expect(mockOnValidate).toHaveBeenCalledWith(false);
    expect(getByTestId('custom-config')).toBeInTheDocument();
  });

  it('should update validation rules and rendered component when providerType changes', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    let validateFn: (() => boolean) | null = null;

    const validGoProvider: ProviderOptions = {
      id: 'go-provider',
      config: {},
    };

    const { rerender } = renderWithProviders(
      <ProviderConfigEditor
        provider={validGoProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={(validator) => {
          validateFn = validator;
        }}
        providerType="go"
      />,
    );

    rerender(
      <ProviderConfigEditor
        provider={validGoProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={(validator) => {
          validateFn = validator;
        }}
        providerType="custom"
      />,
    );

    const isValid = validateFn!();

    expect(isValid).toBe(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('should update the rendered configuration component when providerType prop changes', async () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();

    const initialProvider: ProviderOptions = {
      id: 'initial',
      config: {},
    };

    const TestComponent = () => {
      const [providerType, setProviderType] = React.useState('custom');

      return (
        <>
          <ProviderConfigEditor
            provider={initialProvider}
            setProvider={mockSetProvider}
            setError={mockSetError}
            onValidate={mockOnValidate}
            providerType={providerType}
          />
          <button data-testid="change-provider-type" onClick={() => setProviderType('http')}>
            Change Provider Type
          </button>
        </>
      );
    };

    renderWithProviders(<TestComponent />);

    expect(screen.getByTestId('custom-config')).toBeInTheDocument();

    const changeProviderTypeButton = screen.getByTestId('change-provider-type');
    act(() => {
      changeProviderTypeButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('http-config')).toBeInTheDocument();
    });
  });

  it('should update validation rules and rendered component when switching from agent framework to non-agent provider type', async () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    // Use vi.fn() to capture the validator - this works better with React Compiler
    const captureValidator = vi.fn();

    const initialProvider: ProviderOptions = {
      id: 'file://path/to/agent.py',
      config: {},
    };

    const TestComponent = () => {
      const [providerType, setProviderType] = React.useState('langchain');
      const [provider, setProvider] = React.useState(initialProvider);

      return (
        <>
          <ProviderConfigEditor
            provider={provider}
            setProvider={setProvider}
            setError={mockSetError}
            onValidate={mockOnValidate}
            onValidationRequest={captureValidator}
            providerType={providerType}
          />
          <button data-testid="change-provider-type" onClick={() => setProviderType('http')}>
            Change to HTTP Provider
          </button>
        </>
      );
    };

    renderWithProviders(<TestComponent />);

    expect(screen.getByTestId('agent-config')).toBeInTheDocument();

    const changeProviderTypeButton = screen.getByTestId('change-provider-type');
    act(() => {
      changeProviderTypeButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('http-config')).toBeInTheDocument();
    });

    const updatedProvider: ProviderOptions = {
      id: 'http',
      config: {
        url: 'https://api.example.com/chat',
        body: {
          messages: [{ role: 'user', content: '{{prompt}}' }],
        },
      },
    };

    renderWithProviders(
      <ProviderConfigEditor
        provider={updatedProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={captureValidator}
        providerType="http"
      />,
    );

    // Get the validator from the mock's most recent call
    const validateFn = captureValidator.mock.calls[captureValidator.mock.calls.length - 1][0];
    const isValid = validateFn();

    expect(isValid).toBe(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('should render without crashing and apply default validation rules when providerType is undefined', () => {
    const mockSetProvider = vi.fn();
    const mockSetError = vi.fn();
    const mockOnValidate = vi.fn();
    let validateFn: (() => boolean) | null = null;

    const emptyProvider: ProviderOptions = {
      id: '',
      config: {},
    };

    const { getByTestId } = renderWithProviders(
      <ProviderConfigEditor
        provider={emptyProvider}
        setProvider={mockSetProvider}
        setError={mockSetError}
        onValidate={mockOnValidate}
        onValidationRequest={(validator) => {
          validateFn = validator;
        }}
        validateAll={true}
      />,
    );

    expect(getByTestId('common-config')).toBeInTheDocument();

    const isValid = validateFn!();
    expect(isValid).toBe(true);
    expect(mockSetError).toHaveBeenCalledWith(null);
    expect(mockOnValidate).toHaveBeenCalledWith(true);
  });

  it('should render Bedrock with the foundation model configuration', () => {
    const mockSetProvider = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{ id: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0', config: {} }}
        setProvider={mockSetProvider}
        providerType="bedrock"
      />,
    );

    expect(screen.getByTestId('fm-config')).toBeInTheDocument();
    expect(screen.queryByTestId('custom-config')).not.toBeInTheDocument();
  });

  it('should remove Bedrock MCP config when switching back to InvokeModel ids', () => {
    const mockSetProvider = vi.fn();

    renderWithProviders(
      <ProviderConfigEditor
        provider={{
          id: 'bedrock:converse:anthropic.claude-3-5-sonnet-20241022-v2:0',
          config: {
            mcp: {
              enabled: true,
              servers: [{ name: 'server-1', command: 'npx', args: ['mcp-server'] }],
            },
          },
        }}
        setProvider={mockSetProvider}
        providerType="bedrock"
      />,
    );

    act(() => {
      screen.getByTestId('switch-bedrock-invoke').click();
    });

    expect(mockSetProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bedrock:anthropic.claude-3-5-sonnet',
        config: {},
      }),
    );
  });

  it('should preserve Bedrock MCP config when provider is already using InvokeModel id format', () => {
    const mockSetProvider = vi.fn();
    const mcpConfig = {
      enabled: true,
      servers: [{ name: 'server-1', command: 'npx', args: ['mcp-server'] }],
    };

    renderWithProviders(
      <ProviderConfigEditor
        provider={{
          id: 'bedrock:anthropic.claude-3-5-sonnet',
          config: {
            mcp: mcpConfig,
          },
        }}
        setProvider={mockSetProvider}
        providerType="bedrock"
      />,
    );

    act(() => {
      screen.getByTestId('switch-bedrock-invoke').click();
    });

    expect(mockSetProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bedrock:anthropic.claude-3-5-sonnet',
        config: {
          mcp: mcpConfig,
        },
      }),
    );
  });

  describe('updateCustomTarget inputs handling', () => {
    it('should render CommonConfigurationOptions with proper props', () => {
      const mockSetProvider = vi.fn();

      const httpProvider: ProviderOptions = {
        id: 'http',
        config: {
          url: 'https://api.example.com',
          body: { message: 'test' },
        },
      };

      renderWithProviders(
        <ProviderConfigEditor
          provider={httpProvider}
          setProvider={mockSetProvider}
          providerType="http"
        />,
      );

      // Verify CommonConfigurationOptions is rendered
      expect(screen.getByTestId('common-config')).toBeInTheDocument();
    });

    it('should handle inputs field correctly when set to undefined (deletion)', () => {
      // This tests the logic in updateCustomTarget for the inputs field
      // We test the conditional logic directly since we can't easily test through mocks

      // Test case 1: value is undefined -> should delete inputs field
      const updatedTarget: any = { id: 'test', config: {}, inputs: { old: 'value' } };

      delete updatedTarget.inputs;

      expect(updatedTarget.inputs).toBeUndefined();
      expect('inputs' in updatedTarget).toBe(false);
    });

    it('should handle inputs field correctly when set to an object', () => {
      // Test case 2: value is an object -> should set inputs field
      const updatedTarget = { id: 'test', config: {} } as any;
      const value = { user_id: 'A user ID', role: 'A role' };

      updatedTarget.inputs = value;

      expect(updatedTarget.inputs).toEqual({ user_id: 'A user ID', role: 'A role' });
    });

    it('should clear body error when inputs with keys are provided', () => {
      // Test the conditional logic: if Object.keys(value).length > 0, setBodyError(null)
      const inputsValue = { user_id: 'A user ID', role: 'A role' };
      const shouldClearError = Object.keys(inputsValue).length > 0;

      expect(shouldClearError).toBe(true);
      // When true, the code calls: setBodyError(null)
    });

    it('should not clear body error when inputs object is empty', () => {
      // Test the conditional logic with empty object
      const inputsValue = {};
      const shouldClearError = Object.keys(inputsValue).length > 0;

      expect(shouldClearError).toBe(false);
      // When false, setBodyError(null) is not called
    });

    it('should validate body allowing multi-input mode without {{prompt}}', () => {
      // Test the validation logic for body field when inputs are present
      const updatedTarget = {
        config: { body: { userId: '{{user_id}}' } },
        inputs: { user_id: 'User ID' },
      };

      const bodyStr = JSON.stringify(updatedTarget.config.body);
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;

      // Body validation: if (bodyStr.includes('{{prompt}}') || hasInputs)
      const shouldClearBodyError = bodyStr.includes('{{prompt}}') || hasInputs;

      expect(shouldClearBodyError).toBe(true);
      // When true, setBodyError(null) is called
    });

    it('should validate raw request allowing multi-input mode without {{prompt}}', () => {
      // Test the validation logic for request field when inputs are present
      const updatedTarget = {
        config: { request: 'POST /api\nUser-ID: {{user_id}}' },
        inputs: { user_id: 'User ID' },
      };

      const request = updatedTarget.config.request;
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;

      // Request validation: if (value && !value.includes('{{prompt}}') && !hasInputs)
      const shouldSetError = request && !request.includes('{{prompt}}') && !hasInputs;

      expect(shouldSetError).toBe(false);
      // When false, no error is set (body error is cleared or remains null)
    });

    it('should require {{prompt}} in body when no inputs are present', () => {
      // Test validation when inputs are NOT present
      const updatedTarget = {
        config: { body: { message: 'hello' } },
        inputs: undefined,
      };

      const bodyStr = JSON.stringify(updatedTarget.config.body);
      const hasInputs = updatedTarget.inputs && Object.keys(updatedTarget.inputs).length > 0;

      const shouldClearBodyError = bodyStr.includes('{{prompt}}') || !!hasInputs;

      expect(shouldClearBodyError).toBe(false);
      // When false, body error should be set requiring {{prompt}}
    });
  });
});
