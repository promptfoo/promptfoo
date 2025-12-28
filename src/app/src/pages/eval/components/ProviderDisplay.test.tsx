import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ProviderDisplay, sanitizeConfig } from './ProviderDisplay';

describe('sanitizeConfig', () => {
  describe('sensitive field names', () => {
    it('redacts apiKey field', () => {
      const config = { apiKey: 'sk-1234567890abcdef', temperature: 0.7 };
      const result = sanitizeConfig(config);
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.temperature).toBe(0.7);
    });

    it('redacts api_key field (snake_case)', () => {
      const config = { api_key: 'secret-key', model: 'gpt-4' };
      const result = sanitizeConfig(config);
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.model).toBe('gpt-4');
    });

    it('redacts token field', () => {
      const config = { token: 'bearer-token-here', max_tokens: 1000 };
      const result = sanitizeConfig(config);
      expect(result.token).toBe('[REDACTED]');
      expect(result.max_tokens).toBe(1000);
    });

    it('redacts password field', () => {
      const config = { password: 'supersecret', username: 'user' };
      const result = sanitizeConfig(config);
      expect(result.password).toBe('[REDACTED]');
      expect(result.username).toBe('user');
    });

    it('redacts credentials field', () => {
      const config = { credentials: { key: 'value' }, setting: true };
      const result = sanitizeConfig(config);
      expect(result.credentials).toBe('[REDACTED]');
      expect(result.setting).toBe(true);
    });

    it('redacts secret field', () => {
      const config = { secret: 'my-secret', public: 'my-public' };
      const result = sanitizeConfig(config);
      expect(result.secret).toBe('[REDACTED]');
      expect(result.public).toBe('my-public');
    });

    it('is case-insensitive for field names', () => {
      const config = { ApiKey: 'secret', APIKEY: 'secret2', apiKEY: 'secret3' };
      const result = sanitizeConfig(config);
      expect(result.ApiKey).toBe('[REDACTED]');
      expect(result.APIKEY).toBe('[REDACTED]');
      expect(result.apiKEY).toBe('[REDACTED]');
    });
  });

  describe('sensitive header names', () => {
    it('redacts Authorization header', () => {
      const config = {
        headers: {
          Authorization: 'Bearer token123',
          'Content-Type': 'application/json',
        },
      };
      const result = sanitizeConfig(config);
      expect(result.headers.Authorization).toBe('[REDACTED]');
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    it('redacts X-API-Key header', () => {
      const config = {
        headers: {
          'X-API-Key': 'my-api-key',
          Accept: 'application/json',
        },
      };
      const result = sanitizeConfig(config);
      expect(result.headers['X-API-Key']).toBe('[REDACTED]');
      expect(result.headers.Accept).toBe('application/json');
    });

    it('redacts x-auth-token header (case-insensitive)', () => {
      const config = {
        headers: {
          'x-auth-token': 'token-value',
        },
      };
      const result = sanitizeConfig(config);
      expect(result.headers['x-auth-token']).toBe('[REDACTED]');
    });

    it('does not redact non-sensitive headers', () => {
      const config = {
        headers: {
          'User-Agent': 'MyApp/1.0',
          'X-Custom-Header': 'custom-value',
        },
      };
      const result = sanitizeConfig(config);
      expect(result.headers['User-Agent']).toBe('MyApp/1.0');
      expect(result.headers['X-Custom-Header']).toBe('custom-value');
    });
  });

  describe('sensitive value patterns', () => {
    it('redacts OpenAI API keys (sk-...)', () => {
      const config = {
        someField: 'sk-1234567890abcdefghijklmnop',
        otherField: 'normal-value',
      };
      const result = sanitizeConfig(config);
      expect(result.someField).toBe('[REDACTED]');
      expect(result.otherField).toBe('normal-value');
    });

    it('redacts OpenAI project keys (sk-proj-...)', () => {
      const config = {
        key: 'sk-proj-abcdefghijklmnopqrstuvwxyz123456',
      };
      const result = sanitizeConfig(config);
      expect(result.key).toBe('[REDACTED]');
    });

    it('redacts Anthropic keys (sk-ant-...)', () => {
      const config = {
        key: 'sk-ant-api03-abcdefghijklmnop',
      };
      const result = sanitizeConfig(config);
      expect(result.key).toBe('[REDACTED]');
    });

    it('redacts Bearer tokens in values', () => {
      const config = {
        auth: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
      };
      const result = sanitizeConfig(config);
      expect(result.auth).toBe('[REDACTED]');
    });

    it('redacts long alphanumeric strings (likely tokens)', () => {
      const config = {
        // 64+ chars to trigger redaction (threshold is 64 to reduce false positives)
        possibleToken: 'abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZab',
        shortValue: 'abc123',
        mediumValue: 'abcdefghijklmnopqrstuvwxyz1234567890ABCD', // 40 chars - not redacted
      };
      const result = sanitizeConfig(config);
      expect(result.possibleToken).toBe('[REDACTED]');
      expect(result.shortValue).toBe('abc123');
      expect(result.mediumValue).toBe('abcdefghijklmnopqrstuvwxyz1234567890ABCD');
    });

    it('redacts AWS access keys', () => {
      const config = {
        awsKey: 'AKIAIOSFODNN7EXAMPLE',
      };
      const result = sanitizeConfig(config);
      expect(result.awsKey).toBe('[REDACTED]');
    });

    it('redacts Google API keys', () => {
      const config = {
        googleKey: 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe',
      };
      const result = sanitizeConfig(config);
      expect(result.googleKey).toBe('[REDACTED]');
    });

    it('does not redact normal strings', () => {
      const config = {
        model: 'gpt-4o',
        prompt: 'Hello world',
        format: 'json',
      };
      const result = sanitizeConfig(config);
      expect(result.model).toBe('gpt-4o');
      expect(result.prompt).toBe('Hello world');
      expect(result.format).toBe('json');
    });
  });

  describe('excluded fields', () => {
    it('excludes callApi field entirely', () => {
      const config = { callApi: () => {}, temperature: 0.5 };
      const result = sanitizeConfig(config);
      expect(result.callApi).toBeUndefined();
      expect(result.temperature).toBe(0.5);
    });

    it('excludes transform field entirely', () => {
      const config = { transform: 'some transform', model: 'gpt-4' };
      const result = sanitizeConfig(config);
      expect(result.transform).toBeUndefined();
      expect(result.model).toBe('gpt-4');
    });

    it('excludes env field entirely', () => {
      const config = { env: { VAR: 'value' }, temperature: 0.7 };
      const result = sanitizeConfig(config);
      expect(result.env).toBeUndefined();
      expect(result.temperature).toBe(0.7);
    });
  });

  describe('nested objects', () => {
    it('sanitizes nested config objects', () => {
      const config = {
        generationConfig: {
          thinkingConfig: {
            thinkingLevel: 'HIGH',
          },
          temperature: 0.7,
        },
      };
      const result = sanitizeConfig(config);
      expect(result.generationConfig.thinkingConfig.thinkingLevel).toBe('HIGH');
      expect(result.generationConfig.temperature).toBe(0.7);
    });

    it('redacts secrets in nested objects', () => {
      const config = {
        nested: {
          apiKey: 'secret-key',
          setting: 'value',
        },
      };
      const result = sanitizeConfig(config);
      expect(result.nested.apiKey).toBe('[REDACTED]');
      expect(result.nested.setting).toBe('value');
    });

    it('handles deeply nested structures', () => {
      const config = {
        level1: {
          level2: {
            level3: {
              apiKey: 'secret',
              value: 'safe',
            },
          },
        },
      };
      const result = sanitizeConfig(config);
      expect(result.level1.level2.level3.apiKey).toBe('[REDACTED]');
      expect(result.level1.level2.level3.value).toBe('safe');
    });
  });

  describe('arrays', () => {
    it('sanitizes arrays of objects', () => {
      const config = {
        items: [
          { name: 'item1', apiKey: 'secret1' },
          { name: 'item2', apiKey: 'secret2' },
        ],
      };
      const result = sanitizeConfig(config);
      expect(result.items[0].name).toBe('item1');
      expect(result.items[0].apiKey).toBe('[REDACTED]');
      expect(result.items[1].name).toBe('item2');
      expect(result.items[1].apiKey).toBe('[REDACTED]');
    });

    it('sanitizes arrays of strings with secrets', () => {
      const config = {
        keys: ['sk-1234567890abcdefghijklmnop', 'normal-string'],
      };
      const result = sanitizeConfig(config);
      expect(result.keys[0]).toBe('[REDACTED]');
      expect(result.keys[1]).toBe('normal-string');
    });
  });

  describe('edge cases', () => {
    it('returns undefined for null input', () => {
      expect(sanitizeConfig(null)).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(sanitizeConfig(undefined)).toBeUndefined();
    });

    it('returns undefined for empty object', () => {
      expect(sanitizeConfig({})).toBeUndefined();
    });

    it('handles primitive values', () => {
      expect(sanitizeConfig('string')).toBe('string');
      expect(sanitizeConfig(123)).toBe(123);
      expect(sanitizeConfig(true)).toBe(true);
    });

    it('prevents infinite recursion with depth limit', () => {
      // Create a deeply nested object
      let obj: any = { value: 'deep' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      // Should not throw, should return undefined for too-deep content
      expect(() => sanitizeConfig(obj)).not.toThrow();
    });
  });
});

describe('ProviderDisplay', () => {
  const renderWithProviders = (
    providerString: string,
    providersArray: any[] | undefined,
    fallbackIndex?: number,
  ) => {
    return render(
      <ProviderDisplay
        providerString={providerString}
        providersArray={providersArray}
        fallbackIndex={fallbackIndex}
      />,
    );
  };

  describe('provider name display', () => {
    it('displays provider with prefix:name format for standard providers', () => {
      renderWithProviders('openai:gpt-4o', undefined);
      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('displays label when matched by label', () => {
      const providers = [{ id: 'openai:gpt-4o', label: 'My Custom GPT' }];
      renderWithProviders('My Custom GPT', providers);
      expect(screen.getByText('My Custom GPT')).toBeInTheDocument();
    });

    it('displays only provider name for providers without colon (e.g., echo)', () => {
      const { container } = renderWithProviders('echo', undefined);
      // Should show just "echo", not "echo:echo"
      const span = container.querySelector('span');
      expect(span?.textContent).toBe('echo');
      // Verify no duplication - only one "echo" text node
      expect(screen.getAllByText('echo')).toHaveLength(1);
    });

    it('does not duplicate display when label equals model name', () => {
      // Critical regression test: when label="gpt-4o" and id="openai:gpt-4o",
      // matching by label should show "gpt-4o" ONCE, not "gpt-4o:gpt-4o"
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'gpt-4o',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('gpt-4o', providers);

      // Should show label exactly once
      expect(screen.getAllByText('gpt-4o')).toHaveLength(1);
      // The display should NOT contain a colon (would indicate duplication)
      const span = screen.getByText('gpt-4o').closest('span');
      expect(span?.textContent).toBe('gpt-4o');
    });
  });

  describe('tooltip behavior', () => {
    it('shows tooltip with config on hover', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7, max_tokens: 1000 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      const providerElement = screen.getByText('gpt-4o');
      expect(providerElement.closest('span')).toHaveStyle({ cursor: 'help' });

      await user.hover(providerElement);

      // Wait for MUI tooltip to appear
      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('temperature');
      expect(tooltip?.textContent).toContain('0.7');
    });

    it('shows id in tooltip when label differs from underlying id', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'Fast Model',
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders('Fast Model', providers);

      expect(screen.getByText('Fast Model')).toBeInTheDocument();

      await user.hover(screen.getByText('Fast Model'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // Should show underlying id since display shows "Fast Model"
      expect(tooltip?.textContent).toContain('id: openai:gpt-4o');
      expect(tooltip?.textContent).toContain('temperature');
    });

    it('shows id in tooltip when label is just the model name', async () => {
      // When label="gpt-4o" but id="openai:gpt-4o", we SHOULD show the id
      // because "gpt-4o" could be from any provider (openai, azure, etc.)
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'gpt-4o',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('id: openai:gpt-4o');
    });

    it('does not show id in tooltip when display already shows full id', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      // Should NOT contain "id:" since display shows "openai:gpt-4o"
      expect(tooltip?.textContent).not.toContain('id:');
      // Should still show config
      expect(tooltip?.textContent).toContain('temperature');
    });

    it('does not show tooltip when provider has no config', () => {
      const providers = [{ id: 'openai:gpt-4o' }];
      renderWithProviders('openai:gpt-4o', providers);

      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      // Cursor should be default (not help) since no tooltip content
      const span = screen.getByText('gpt-4o').closest('span');
      expect(span).toHaveStyle({ cursor: 'default' });
    });

    it('does not show tooltip for string-only provider', () => {
      const providers = ['openai:gpt-4o', 'anthropic:claude-3'];
      renderWithProviders('openai:gpt-4o', providers);

      const span = screen.getByText('gpt-4o').closest('span');
      expect(span).toHaveStyle({ cursor: 'default' });
    });
  });

  describe('edge cases', () => {
    it('handles provider with only label (no id)', () => {
      const providers = [{ label: 'Custom Provider', config: { temperature: 0.5 } }];
      renderWithProviders('Custom Provider', providers);

      expect(screen.getByText('Custom Provider')).toBeInTheDocument();
    });

    it('handles provider with nested config.config structure', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: {
            config: { temperature: 0.8 }, // Double-nested
          },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      await user.hover(screen.getByText('gpt-4o'));

      await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
      const tooltip = document.querySelector('[role="tooltip"]');
      expect(tooltip?.textContent).toContain('temperature');
    });

    it('handles empty providers array gracefully', () => {
      renderWithProviders('openai:gpt-4o', []);

      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('handles provider with multiple colons in name', () => {
      const providers = [
        {
          id: 'google:gemini-2.0-flash:thinking',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('google:gemini-2.0-flash:thinking', providers);

      expect(screen.getByText('google:')).toBeInTheDocument();
      expect(screen.getByText('gemini-2.0-flash:thinking')).toBeInTheDocument();
    });

    it('handles label containing colons without splitting', () => {
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'prod:us-east:gpt4',
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders('prod:us-east:gpt4', providers);

      // Should show the whole label, not split it
      expect(screen.getByText('prod:us-east:gpt4')).toBeInTheDocument();
      // Verify it's shown as a single strong element (label display)
      const strongElement = screen.getByText('prod:us-east:gpt4');
      expect(strongElement.tagName).toBe('STRONG');
    });

    it('handles fallback to index when provider not found by id/label', async () => {
      const user = userEvent.setup();
      const providers = [
        { id: 'openai:gpt-4o', config: { temperature: 0.5 } },
        { id: 'anthropic:claude-3', config: { temperature: 0.7 } },
      ];
      // providerString doesn't match any id/label, but fallbackIndex points to second provider
      const { container } = renderWithProviders('unknown-provider', providers, 1);

      // Hover to verify we get config from index fallback
      const span = container.querySelector('span');
      expect(span).toBeInTheDocument();
      if (span) {
        await user.hover(span);
        await expect.poll(() => document.querySelector('[role="tooltip"]')).toBeTruthy();
        const tooltip = document.querySelector('[role="tooltip"]');
        // Should show config from providers[1] (temperature: 0.7)
        expect(tooltip?.textContent).toContain('temperature');
        expect(tooltip?.textContent).toContain('0.7');
      }
    });

    it('handles undefined providersArray', () => {
      renderWithProviders('openai:gpt-4o', undefined);

      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('handles provider where label equals full id', () => {
      // Edge case: label is same as id - should not show label in this case
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'openai:gpt-4o',
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      // Should show prefix:name format, not as a label
      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
  });
});
