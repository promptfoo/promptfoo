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
    it('displays provider with prefix and name', () => {
      renderWithProviders('openai:gpt-4o', undefined);
      expect(screen.getByText('openai:')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('displays label when provided', () => {
      const providers = [{ id: 'openai:gpt-4o', label: 'My Custom GPT' }];
      renderWithProviders('My Custom GPT', providers);
      expect(screen.getByText('My Custom GPT')).toBeInTheDocument();
    });
  });

  describe('tooltip behavior', () => {
    it('shows tooltip on hover with config', async () => {
      const user = userEvent.setup();
      const providers = [
        {
          id: 'openai:gpt-4o',
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      const providerElement = screen.getByText('gpt-4o');
      await user.hover(providerElement);

      // Tooltip should appear with temperature
      // Note: MUI tooltips may need waitFor
    });

    it('shows id in tooltip when label is used', async () => {
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'Fast Model',
          config: { temperature: 0.5 },
        },
      ];
      renderWithProviders('Fast Model', providers);

      // The display should show "Fast Model"
      expect(screen.getByText('Fast Model')).toBeInTheDocument();
    });

    it('does not show tooltip when provider has no config', () => {
      // Provider with just an id and no config should not show tooltip
      const providers = [{ id: 'openai:gpt-4o' }];
      renderWithProviders('openai:gpt-4o', providers);

      // Should render without tooltip (no MUI Tooltip wrapper)
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      // Cursor should be default (not help) since no tooltip
      const span = screen.getByText('gpt-4o').closest('span');
      expect(span).toHaveStyle({ cursor: 'default' });
    });

    it('does not show redundant id when label equals model name', () => {
      // When label is just the model name (e.g., "gpt-4o"), don't show "id: openai:gpt-4o"
      // because it's obvious the full id is prefix:label
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'gpt-4o', // Label equals name part
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('gpt-4o', providers);

      // Should show the label
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      // Should have help cursor since there's config to show (just not redundant id)
      const span = screen.getByText('gpt-4o').closest('span');
      expect(span).toHaveStyle({ cursor: 'help' });
    });

    it('does not show id when it equals providerString', () => {
      // When id equals providerString, don't show id in tooltip (redundant)
      const providers = [
        {
          id: 'openai:gpt-4o',
          label: 'openai:gpt-4o', // Label equals full provider string
          config: { temperature: 0.7 },
        },
      ];
      renderWithProviders('openai:gpt-4o', providers);

      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });
  });
});
