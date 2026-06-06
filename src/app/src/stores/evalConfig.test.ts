import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  getPersistableEvalConfig,
  MAX_PERSISTED_EVAL_CONFIG_BYTES,
  useStore,
} from './evalConfig';
import type { UnifiedConfig } from '@promptfoo/types';

describe('evalConfig store', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset the store state before each test
    useStore.getState().reset();
  });

  describe('config management', () => {
    it('should initialize with default config', () => {
      const { config } = useStore.getState();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('should update config with updateConfig', () => {
      const updates = {
        description: 'Test Description',
        providers: [{ id: 'openai:gpt-4' }],
      };

      useStore.getState().updateConfig(updates);

      const { config } = useStore.getState();
      expect(config.description).toBe('Test Description');
      expect(config.providers).toEqual([{ id: 'openai:gpt-4' }]);
      // Other fields should remain as defaults
      expect(config.prompts).toEqual([]);
    });

    it('should replace entire config with setConfig', () => {
      const newConfig = {
        description: 'New Config',
        providers: [{ id: 'anthropic:claude' }],
        prompts: ['Test prompt'],
      };

      useStore.getState().setConfig(newConfig);

      const { config } = useStore.getState();
      expect(config).toEqual(newConfig);
      // Note: fields not in newConfig are undefined, not defaults
      expect(config.env).toBeUndefined();
    });

    it('should reset to default config', () => {
      // First, modify the config
      useStore.getState().updateConfig({
        description: 'Modified',
        providers: [{ id: 'test' }],
      });

      // Then reset
      useStore.getState().reset();

      const { config } = useStore.getState();
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('does not persist sensitive environment values used for the current evaluation', () => {
      useStore.getState().updateConfig({
        description: 'Session config',
        env: {
          OPENAI_API_KEY: 'session-only-key',
          OPENAI_API_HOST: 'https://api.example.com',
          AWS_BEDROCK_REGION: 'us-east-1',
        },
      });

      expect(useStore.getState().config.env).toEqual({
        OPENAI_API_KEY: 'session-only-key',
        OPENAI_API_HOST: 'https://api.example.com',
        AWS_BEDROCK_REGION: 'us-east-1',
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.description).toBe('Session config');
      // Sensitive keys (API keys/secrets/tokens) are stripped; non-sensitive
      // configuration values like hostnames and region names are preserved.
      expect(persistedState.state.config.env).toEqual({
        OPENAI_API_HOST: 'https://api.example.com',
        AWS_BEDROCK_REGION: 'us-east-1',
      });
    });

    it('does not persist recognizable secret environment values under neutral names', () => {
      useStore.getState().updateConfig({
        env: {
          SERVICE_AUTH: 'Bearer neutral-service-token-1234567890',
          CONFIG_VALUE: 'sk-abcdefghijklmnopqrstuvwxyz1234567890',
          DATABASE_URL: 'https://db-user:db-password@db.example.test/app',
          SERVICE_URL: 'https://api.example.test/v1?token=url-env-secret',
          SERVICE_REGION: 'us-east-1',
          PUBLIC_URL: 'https://api.example.test/v1',
        },
      });

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.env).toEqual({
        SERVICE_REGION: 'us-east-1',
        PUBLIC_URL: 'https://api.example.test/v1',
      });
      expect(JSON.stringify(persisted)).not.toContain('neutral-service-token');
      expect(JSON.stringify(persisted)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
      expect(JSON.stringify(persisted)).not.toContain('db-password');
      expect(JSON.stringify(persisted)).not.toContain('url-env-secret');
    });

    it('does not persist inline provider API keys used for the current evaluation', () => {
      useStore.getState().updateConfig({
        providers: [
          {
            id: 'openai:gpt-4o',
            config: {
              apiKey: 'inline-session-key',
              headers: { Authorization: 'Bearer temporary-token', 'x-request-id': 'visible-id' },
              temperature: 0.2,
            },
          },
        ],
      });

      const currentProviders = useStore.getState().config.providers;
      expect(Array.isArray(currentProviders)).toBe(true);
      if (!Array.isArray(currentProviders)) {
        throw new Error('Expected providers to be stored as an array');
      }
      expect((currentProviders[0] as { config: { apiKey?: string } }).config.apiKey).toBe(
        'inline-session-key',
      );

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.providers[0].config).toEqual({
        headers: { 'x-request-id': 'visible-id' },
        temperature: 0.2,
      });
    });

    it('redacts credentials from aliased and nested provider placements', () => {
      const provider = (secret: string) => ({
        id: 'http',
        config: { apiKey: secret, endpoint: 'https://example.com' },
      });

      useStore.getState().setConfig({
        targets: [provider('target-secret')],
        defaultTest: {
          provider: provider('default-provider-secret'),
          options: { provider: provider('default-grader-secret') },
          assert: [{ type: 'llm-rubric', value: 'correct', provider: provider('assert-secret') }],
        },
        tests: [
          {
            provider: provider('test-provider-secret'),
            options: { provider: provider('test-grader-secret') },
            vars: { payload: { provider: { apiKey: 'ordinary-input-value' } } },
            assert: [{ type: 'equals', value: { provider: { apiKey: 'expected-output-value' } } }],
          },
        ],
        scenarios: [
          {
            config: [{ provider: provider('scenario-default-secret') }],
            tests: [{ provider: provider('scenario-test-secret') }],
          },
        ],
        redteam: {
          provider: provider('redteam-secret'),
          strategies: [
            {
              id: 'crescendo',
              config: {
                redteamProvider: provider('redteam-strategy-provider-secret'),
                stateful: true,
              },
            },
          ],
        },
      } as any);

      const persistedConfig = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persistedConfig.targets[0].config).toEqual({ endpoint: 'https://example.com' });
      expect(persistedConfig.defaultTest.provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.defaultTest.options.provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.defaultTest.assert[0].provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.tests[0].provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.tests[0].options.provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.tests[0].vars.payload).toEqual({
        provider: { apiKey: 'ordinary-input-value' },
      });
      expect(persistedConfig.tests[0].assert[0].value).toEqual({
        provider: { apiKey: 'expected-output-value' },
      });
      expect(persistedConfig.scenarios[0].config[0].provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.scenarios[0].tests[0].provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.redteam.provider.config).toEqual({
        endpoint: 'https://example.com',
      });
      expect(persistedConfig.redteam.strategies[0].config).toEqual({
        redteamProvider: {
          id: 'http',
          config: { endpoint: 'https://example.com' },
        },
        stateful: true,
      });
      expect(JSON.stringify(persistedConfig)).not.toContain('-secret');
    });

    it('redacts assertion and redteam plugin configuration credentials', () => {
      useStore.getState().setConfig({
        defaultTest: {
          assert: [
            {
              type: 'javascript',
              value: 'file://assertion.js',
              config: {
                apiKey: 'assertion-config-secret',
                endpoint: 'https://grader.example.com?token=assertion-url-secret',
                mode: 'strict',
              },
            },
          ],
        },
        redteam: {
          plugins: [
            {
              id: 'file://custom-plugin.js',
              config: {
                headers: { Authorization: 'Bearer plugin-header-secret' },
                endpoint: 'https://plugin.example.com?api_key=plugin-url-secret',
                purpose: 'visible-purpose',
              },
            },
          ],
          strategies: [
            {
              id: 'file://custom-strategy.js',
              config: {
                headers: { Authorization: 'Bearer strategy-header-secret' },
                endpoint: 'https://strategy.example.com?token=strategy-url-secret',
                stateful: true,
              },
            },
          ],
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.defaultTest.assert[0].config).toEqual({
        endpoint: 'https://grader.example.com?token=[REDACTED]',
        mode: 'strict',
      });
      expect(persisted.redteam.plugins[0].config).toEqual({
        headers: {},
        endpoint: 'https://plugin.example.com?api_key=[REDACTED]',
        purpose: 'visible-purpose',
      });
      expect(persisted.redteam.strategies[0].config).toEqual({
        headers: {},
        endpoint: 'https://strategy.example.com?token=[REDACTED]',
        stateful: true,
      });
      expect(JSON.stringify(persisted)).not.toContain('assertion-config-secret');
      expect(JSON.stringify(persisted)).not.toContain('plugin-header-secret');
      expect(JSON.stringify(persisted)).not.toContain('plugin-url-secret');
      expect(JSON.stringify(persisted)).not.toContain('strategy-header-secret');
      expect(JSON.stringify(persisted)).not.toContain('strategy-url-secret');
    });

    it('redacts executable redteam configs in test metadata without walking ordinary metadata', () => {
      useStore.getState().setConfig({
        tests: [
          {
            metadata: {
              pluginConfig: {
                headers: {
                  Authorization: 'Bearer plugin-metadata-secret',
                  'X-Visible': 'kept',
                },
                endpoint: 'https://plugin.example.com?api_key=plugin-metadata-url-secret',
              },
              strategyConfig: {
                redteamProvider: {
                  id: 'http',
                  config: {
                    headers: { Authorization: 'Bearer strategy-metadata-secret' },
                    endpoint: 'https://strategy.example.com?token=strategy-metadata-url-secret',
                  },
                },
                stateful: true,
              },
              resultPayload: { apiKey: 'ordinary-metadata-value' },
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.tests[0].metadata).toEqual({
        pluginConfig: {
          headers: { 'X-Visible': 'kept' },
          endpoint: 'https://plugin.example.com?api_key=[REDACTED]',
        },
        strategyConfig: {
          redteamProvider: {
            id: 'http',
            config: {
              headers: {},
              endpoint: 'https://strategy.example.com?token=[REDACTED]',
            },
          },
          stateful: true,
        },
        resultPayload: { apiKey: 'ordinary-metadata-value' },
      });
      expect(JSON.stringify(persisted)).not.toContain('plugin-metadata-secret');
      expect(JSON.stringify(persisted)).not.toContain('plugin-metadata-url-secret');
      expect(JSON.stringify(persisted)).not.toContain('strategy-metadata-secret');
      expect(JSON.stringify(persisted)).not.toContain('strategy-metadata-url-secret');
    });

    it('redacts test vars used by credential templates without walking ordinary payloads', () => {
      useStore.getState().setConfig({
        env: {
          SERVICE_AUTH: 'short-secret',
          'SERVICE-AUTH': 'bracket-short-secret',
          NORMAL_ENV: 'visible-env',
        },
        providers: [
          {
            id: 'http',
            config: {
              headers: {
                Authorization: 'Bearer {{ api_token }}',
                'X-Remote-Authorization': 'Bearer {{ env.SERVICE_AUTH }}',
                'X-Bracket-Authorization': 'Bearer {{ env["SERVICE-AUTH"] }}',
                'X-Bracket-Var-Authorization': 'Bearer {{ auth["key-with-dash"] }}',
                'X-Context-Authorization': 'Bearer {{ user_token }}',
              },
              url: 'https://api.example.com?api_key={{ auth.key | urlencode }}',
              body: 'prompt={{ prompt }}&client_secret={{ api_token }}',
            },
          },
        ],
        defaultTest: {
          vars: { api_token: 'default-test-token-secret', visible: 'default-visible' },
        },
        tests: [
          {
            vars: {
              api_token: 'test-token-secret',
              auth: {
                key: 'nested-test-token-secret',
                'key-with-dash': 'bracket-var-secret',
                visible: 'nested-visible',
              },
              prompt: 'ordinary-prompt-input',
              payload: { provider: { apiKey: 'ordinary-input-value' } },
            },
          },
        ],
        redteam: {
          contexts: [
            {
              id: 'tenant-a',
              vars: { user_token: 'context-token-secret', visible: 'context-visible' },
            },
          ],
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.env).toEqual({ NORMAL_ENV: 'visible-env' });
      expect(persisted.defaultTest.vars).toEqual({ visible: 'default-visible' });
      expect(persisted.tests[0].vars).toEqual({
        auth: { visible: 'nested-visible' },
        prompt: 'ordinary-prompt-input',
        payload: { provider: { apiKey: 'ordinary-input-value' } },
      });
      expect(persisted.redteam.contexts[0].vars).toEqual({ visible: 'context-visible' });
      expect(JSON.stringify(persisted)).not.toContain('default-test-token-secret');
      expect(JSON.stringify(persisted)).not.toContain('nested-test-token-secret');
      expect(JSON.stringify(persisted)).not.toContain('short-secret');
      expect(JSON.stringify(persisted)).not.toContain('bracket-short-secret');
      expect(JSON.stringify(persisted)).not.toContain('bracket-var-secret');
      expect(JSON.stringify(persisted)).not.toContain('context-token-secret');
    });

    it('drops sources for rejected credential templates and redacted URL userinfo', () => {
      useStore.getState().setConfig({
        env: {
          SERVICE_AUTH: 'top-level-short-value',
          SAFE_SETTING: 'visible-root',
        },
        providers: [
          {
            id: 'http',
            config: {
              headers: {
                Authorization: "Bearer {{ env.SERVICE_AUTH | default('') }}",
                'X-Bare-Authorization': "Bearer {{ bare_password | default('') }}",
              },
            },
            env: {
              SERVICE_AUTH: 'provider-short-value',
              SAFE_SETTING: 'visible-provider',
            },
          },
          'https://svc:{{ basic_password }}@api.example.test/v1',
        ],
        tests: [
          {
            vars: {
              basic_password: 'short-password-value',
              bare_password: 'bare-short-password-value',
              visible: 'kept',
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.env).toEqual({ SAFE_SETTING: 'visible-root' });
      expect(persisted.providers[0]).toEqual({
        id: 'http',
        config: { headers: {} },
        env: { SAFE_SETTING: 'visible-provider' },
      });
      expect(persisted.providers[1]).toBe('https://[REDACTED]@api.example.test/v1');
      expect(persisted.tests[0].vars).toEqual({ visible: 'kept' });
      expect(JSON.stringify(persisted)).not.toContain('top-level-short-value');
      expect(JSON.stringify(persisted)).not.toContain('provider-short-value');
      expect(JSON.stringify(persisted)).not.toContain('short-password-value');
      expect(JSON.stringify(persisted)).not.toContain('bare-short-password-value');
    });

    it('redacts token-shaped path segments in provider URLs', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              url: 'https://hooks.example.test/services/T/B/sk-abcdefghijklmnopqrstuvwxyz1234567890',
              label: 'literal example /sk-zyxwvutsrqponmlkjihgfedcba0987654321 is not a URL',
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers[0].config.url).toContain('/services/T/B/[REDACTED]');
      expect(persisted.providers[0].config.label).toContain(
        '/sk-zyxwvutsrqponmlkjihgfedcba0987654321',
      );
      expect(JSON.stringify(persisted)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890');
    });

    it('redacts opaque tokens in known webhook URL paths and webhook assertions', () => {
      useStore.getState().setConfig({
        providers: [
          'https://hooks.slack.com/services/T000/B000/slack-opaque-value',
          'webhook:https://discord.com/api/webhooks/1234/discord-opaque-value',
          'https://api.example.test/services/T000/B000/ordinary-path',
        ],
        defaultTest: {
          assert: [
            {
              type: 'webhook',
              value: 'https://hooks.slack.com/services/T111/B111/assertion-opaque-value',
            },
          ],
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers).toEqual([
        'https://hooks.slack.com/services/T000/B000/[REDACTED]',
        'webhook:https://discord.com/api/webhooks/1234/[REDACTED]',
        'https://api.example.test/services/T000/B000/ordinary-path',
      ]);
      expect(persisted.defaultTest.assert[0].value).toBe(
        'https://hooks.slack.com/services/T111/B111/[REDACTED]',
      );
      expect(JSON.stringify(persisted)).not.toContain('slack-opaque-value');
      expect(JSON.stringify(persisted)).not.toContain('discord-opaque-value');
      expect(JSON.stringify(persisted)).not.toContain('assertion-opaque-value');
    });

    it('redacts Azure SAS credentials from persisted test file references', () => {
      useStore.getState().setConfig({
        prompts: ['az://account/container/prompts.txt?sig=prompt-reference-secret&sp=r'],
        tests: [
          'az://account/container/tests.yaml?sp=r&sig=file-reference-secret&se=2026-06-01',
          { vars: { prompt: 'visible' } },
        ],
        scenarios: ['az://account/container/scenarios.yaml?sig=scenario-reference-secret&sp=r'],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.prompts[0]).not.toContain('prompt-reference-secret');
      expect(persisted.tests[0]).toContain('az://account/container/tests.yaml?sp=r&sig=');
      expect(persisted.tests[0]).toContain('se=2026-06-01');
      expect(persisted.tests[0]).not.toContain('file-reference-secret');
      expect(persisted.tests[1]).toEqual({ vars: { prompt: 'visible' } });
      expect(persisted.scenarios[0]).not.toContain('scenario-reference-secret');
    });

    it('redacts Azure SAS credentials from legacy prompt-map keys', () => {
      useStore.getState().setConfig({
        prompts: {
          'az://account/container/prompts.txt?sig=legacy-prompt-secret&sp=r': 'secret-file',
          'plain.txt': 'plain-file',
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      const legacyPromptPath = Object.keys(persisted.prompts).find((key) =>
        key.includes('prompts.txt'),
      );
      expect(legacyPromptPath).toContain('sig=');
      expect(legacyPromptPath).not.toContain('legacy-prompt-secret');
      expect(persisted.prompts['plain.txt']).toBe('plain-file');
    });

    it('preserves provider-map IDs while redacting HTTP body and query parameter credentials', () => {
      useStore.getState().setConfig({
        providers: [
          {
            'token-counter': {
              id: 'http',
              config: {
                queryParams: {
                  sig: 'query-signature-secret',
                  pwd: 'query-password-secret',
                  region: 'us',
                },
                body: {
                  auth: 'body-auth-secret',
                  pwd: 'body-password-secret',
                  nested: { auth: 'nested-body-auth-secret' },
                  prompt: 'visible-prompt',
                },
              },
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers[0]['token-counter'].config).toEqual({
        queryParams: { region: 'us' },
        body: { nested: {}, prompt: 'visible-prompt' },
      });
      expect(JSON.stringify(persisted)).not.toContain('query-signature-secret');
      expect(JSON.stringify(persisted)).not.toContain('query-password-secret');
      expect(JSON.stringify(persisted)).not.toContain('body-auth-secret');
      expect(JSON.stringify(persisted)).not.toContain('body-password-secret');
      expect(JSON.stringify(persisted)).not.toContain('nested-body-auth-secret');
    });

    it('removes sensitive environment values from previously persisted browser state on rehydrate', async () => {
      localStorage.setItem(
        'promptfoo',
        JSON.stringify({
          state: {
            config: {
              description: 'Previously saved config',
              env: {
                OPENAI_API_KEY: 'old-persisted-key',
                OPENAI_API_HOST: 'https://api.example.com',
              },
              providers: [
                {
                  id: 'openai:gpt-4o',
                  config: {
                    apiKey: 'old-inline-key',
                    headers: { Authorization: 'Bearer old-token' },
                    temperature: 0.4,
                  },
                },
              ],
            },
          },
          version: 0,
        }),
      );

      await useStore.persist.rehydrate();

      expect(useStore.getState().config.description).toBe('Previously saved config');
      expect(useStore.getState().config.env).toEqual({
        OPENAI_API_HOST: 'https://api.example.com',
      });
      const rehydratedProviders = useStore.getState().config.providers;
      expect(Array.isArray(rehydratedProviders)).toBe(true);
      if (!Array.isArray(rehydratedProviders)) {
        throw new Error('Expected providers to rehydrate as an array');
      }
      expect((rehydratedProviders[0] as { config: Record<string, unknown> }).config).toEqual({
        headers: {},
        temperature: 0.4,
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.env).toEqual({
        OPENAI_API_HOST: 'https://api.example.com',
      });
      expect(persistedState.state.config.providers[0].config).toEqual({
        headers: {},
        temperature: 0.4,
      });
      expect(JSON.stringify(persistedState)).not.toContain('old-persisted-key');
      expect(JSON.stringify(persistedState)).not.toContain('old-inline-key');
      expect(JSON.stringify(persistedState)).not.toContain('Bearer old-token');
    });

    it('strips credentials regardless of casing convention', () => {
      useStore.getState().updateConfig({
        providers: [
          {
            id: 'http',
            config: {
              bearerToken: 'a',
              access_token: 'b',
              refreshToken: 'c',
              privateKey: 'd',
              pfxPassword: 'e',
              keystorePassphrase: 'f',
              'x-api-key': 'g',
              signature: 'h',
              cookie: 'i',
              endpoint: 'https://example.com',
              timeoutMs: 5000,
            } as any,
          },
        ],
        env: {
          BEARER_TOKEN: 'a',
          ACCESS_TOKEN: 'b',
          REFRESH_TOKEN: 'c',
          AWS_SECRET_ACCESS_KEY: 'd',
          GITHUB_TOKEN: 'e',
          DATABASE_PASSWORD: 'f',
          API_BASE_URL: 'https://api.example.com',
          MAX_RETRIES: '3',
        } as any,
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.providers[0].config).toEqual({
        endpoint: 'https://example.com',
        timeoutMs: 5000,
      });
      expect(persistedState.state.config.env).toEqual({
        API_BASE_URL: 'https://api.example.com',
        MAX_RETRIES: '3',
      });
    });

    it('strips all-uppercase acronym credential names and plurals', () => {
      useStore.getState().updateConfig({
        providers: [
          {
            id: 'http',
            config: {
              SSHKey: 'a',
              IDToken: 'b',
              JWTToken: 'c',
              XAPIKey: 'd',
              JSONWebToken: 'e',
              accessTokens: 'f',
              cookies: 'g',
              secrets: 'h',
              passwords: 'i',
              endpoint: 'https://example.com',
            } as any,
          },
        ],
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.providers[0].config).toEqual({
        endpoint: 'https://example.com',
      });
    });

    it('preserves non-secret auth selectors and token settings while stripping credential values', () => {
      useStore.getState().updateConfig({
        providers: [
          {
            id: 'http',
            config: {
              apiKeyEnvar: 'CUSTOM_HTTP_API_KEY',
              auth: {
                type: 'oauth',
                tokenUrl: 'https://auth.example.com/oauth/token',
                clientId: 'client-id',
                clientSecret: 'client-secret',
                keyName: 'X-API-Key',
                keyValue: 'secret-key-value',
              },
              azureTokenScope: 'https://cognitiveservices.azure.com/.default',
              maxTokens: 256,
              maxOutputTokens: 384,
              max_tokens: 128,
              max_completion_tokens: 64,
              session_key: 'session-continuity-id',
              signature: 'computed-signature-secret',
              signatureAlgorithm: 'HMAC-SHA256',
              signatureDataTemplate: '{{body}}',
              signatureRefreshBufferMs: 30_000,
              signatureValidityMs: 300_000,
              tokenEstimation: {
                enabled: true,
                multiplier: 1.5,
              },
              privateKey: 'inline-private-key',
              privateKeyPath: '/var/run/certs/signing-key.pem',
              keyAlias: 'service-signing-key',
              tls: {
                keyPath: '/var/run/certs/client.key',
                certPath: '/var/run/certs/client.crt',
                key: 'inline-client-key',
              },
            } as any,
          },
        ],
        env: {
          AZURE_TOKEN_SCOPE: 'https://cognitiveservices.azure.com/.default',
          OPENAI_MAX_TOKENS: '512',
          OPENAI_MAX_COMPLETION_TOKENS: '128',
          OPENAI_API_KEY: 'secret-openai-key',
          GITHUB_TOKEN: 'secret-github-token',
        } as any,
      });

      const persistedState = JSON.parse(localStorage.getItem('promptfoo') || '{}');
      expect(persistedState.state.config.providers[0].config).toEqual({
        apiKeyEnvar: 'CUSTOM_HTTP_API_KEY',
        auth: {
          type: 'oauth',
          tokenUrl: 'https://auth.example.com/oauth/token',
          clientId: 'client-id',
          keyName: 'X-API-Key',
        },
        azureTokenScope: 'https://cognitiveservices.azure.com/.default',
        maxTokens: 256,
        maxOutputTokens: 384,
        max_tokens: 128,
        max_completion_tokens: 64,
        session_key: 'session-continuity-id',
        signatureAlgorithm: 'HMAC-SHA256',
        signatureDataTemplate: '{{body}}',
        signatureRefreshBufferMs: 30_000,
        signatureValidityMs: 300_000,
        tokenEstimation: {
          enabled: true,
          multiplier: 1.5,
        },
        privateKeyPath: '/var/run/certs/signing-key.pem',
        keyAlias: 'service-signing-key',
        tls: {
          keyPath: '/var/run/certs/client.key',
          certPath: '/var/run/certs/client.crt',
        },
      });
      expect(persistedState.state.config.env).toEqual({
        AZURE_TOKEN_SCOPE: 'https://cognitiveservices.azure.com/.default',
        OPENAI_MAX_TOKENS: '512',
        OPENAI_MAX_COMPLETION_TOKENS: '128',
      });
      expect(JSON.stringify(persistedState)).not.toContain('secret-openai-key');
      expect(JSON.stringify(persistedState)).not.toContain('secret-github-token');
      expect(JSON.stringify(persistedState)).not.toContain('client-secret');
      expect(JSON.stringify(persistedState)).not.toContain('secret-key-value');
      expect(JSON.stringify(persistedState)).not.toContain('computed-signature-secret');
      expect(JSON.stringify(persistedState)).not.toContain('inline-private-key');
      expect(JSON.stringify(persistedState)).not.toContain('inline-client-key');
    });

    it('redacts provider env values selected by credential envar settings', () => {
      useStore.getState().setConfig({
        env: {
          SERVICE_AUTH: 'root-selected-secret',
          BEARER_AUTH: 'root-bearer-secret',
          CF_AUTH: 'root-cloudflare-secret',
          NORMAL_ENV: 'visible-root',
        },
        providers: [
          {
            id: 'watsonx',
            config: {
              apiKeyEnvar: 'SERVICE_AUTH',
              apiBearerTokenEnvar: 'BEARER_AUTH',
              cfAigTokenEnvar: 'CF_AUTH',
              endpoint: 'https://example.com',
            },
            env: {
              SERVICE_AUTH: 'provider-selected-secret',
              BEARER_AUTH: 'provider-bearer-secret',
              CF_AUTH: 'provider-cloudflare-secret',
              NORMAL_ENV: 'visible-provider',
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.env).toEqual({ NORMAL_ENV: 'visible-root' });
      expect(persisted.providers[0]).toEqual({
        id: 'watsonx',
        config: {
          apiKeyEnvar: 'SERVICE_AUTH',
          apiBearerTokenEnvar: 'BEARER_AUTH',
          endpoint: 'https://example.com',
        },
        env: { NORMAL_ENV: 'visible-provider' },
      });
      expect(JSON.stringify(persisted)).not.toContain('root-selected-secret');
      expect(JSON.stringify(persisted)).not.toContain('root-bearer-secret');
      expect(JSON.stringify(persisted)).not.toContain('root-cloudflare-secret');
      expect(JSON.stringify(persisted)).not.toContain('provider-selected-secret');
      expect(JSON.stringify(persisted)).not.toContain('provider-bearer-secret');
      expect(JSON.stringify(persisted)).not.toContain('provider-cloudflare-secret');
    });

    it('redacts provider env values referenced by credential templates', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              headers: {
                Authorization: 'Bearer {{ env.SERVICE_AUTH }}',
                'X-Region': '{{ env.REGION }}',
              },
            },
            env: {
              SERVICE_AUTH: 'abc123',
              REGION: 'us-east-1',
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers[0]).toEqual({
        id: 'http',
        config: {
          headers: {
            Authorization: 'Bearer {{ env.SERVICE_AUTH }}',
            'X-Region': '{{ env.REGION }}',
          },
        },
        env: { REGION: 'us-east-1' },
      });
      expect(JSON.stringify(persisted)).not.toContain('abc123');
    });

    it('preserves additional non-secret provider selectors and behavior flags', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              keyFilename: '/var/run/secrets/service-account.json',
              googleAuthOptions: { keyFilename: '/var/run/secrets/another.json' },
              apiBearerTokenEnvar: 'CUSTOM_WATSONX_BEARER',
              apiKeyRequired: false,
              isPayPerToken: true,
              prompt_cache_key: 'partition-a',
              max_new_tokens: 32,
              max_tokens_to_sample: 64,
              maxResponseTokens: 128,
              max_thinking_tokens: 4096,
              endpoint: 'https://example.com',
            } as any,
          },
        ],
        env: {
          LANGFUSE_PUBLIC_KEY: 'pk-langfuse-public-id',
          LANGFUSE_SECRET_KEY: 'sk-langfuse-secret',
        } as any,
      });

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers[0].config).toEqual({
        keyFilename: '/var/run/secrets/service-account.json',
        googleAuthOptions: { keyFilename: '/var/run/secrets/another.json' },
        apiBearerTokenEnvar: 'CUSTOM_WATSONX_BEARER',
        apiKeyRequired: false,
        isPayPerToken: true,
        prompt_cache_key: 'partition-a',
        max_new_tokens: 32,
        max_tokens_to_sample: 64,
        maxResponseTokens: 128,
        max_thinking_tokens: 4096,
        endpoint: 'https://example.com',
      });
      expect(persisted.env.LANGFUSE_SECRET_KEY).toBeUndefined();
      expect(persisted.env.LANGFUSE_PUBLIC_KEY).toBe('pk-langfuse-public-id');
    });

    it('redacts credentials living in test options and prompts[].config', () => {
      useStore.getState().setConfig({
        prompts: [
          'Plain string prompt',
          {
            raw: 'Hello {{name}}',
            label: 'Inline prompt',
            config: {
              apiKey: 'prompt-leak-apikey',
              headers: {
                Authorization: 'Bearer prompt-leak-token',
                'X-Honeycomb-Team': 'provider-honeycomb-key',
                'X-Observability-Team': 'Bearer neutral-header-token-1234567890',
                'x-trace-id': 'visible',
              },
              temperature: 0.1,
            },
          } as any,
        ],
        defaultTest: {
          options: {
            headers: { Authorization: 'Bearer default-options-token', 'x-debug-id': 'visible-id' },
            transform: 'json.output',
            maxResponseTokens: 256,
          } as any,
        },
        tests: [
          {
            options: {
              headers: { 'x-api-key': 'test-options-key', 'X-Trace-Id': 'visible-trace' },
            } as any,
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.prompts[0]).toBe('Plain string prompt');
      expect(persisted.prompts[1]).toEqual({
        raw: 'Hello {{name}}',
        label: 'Inline prompt',
        config: {
          headers: { 'x-trace-id': 'visible' },
          temperature: 0.1,
        },
      });
      expect(persisted.defaultTest.options).toEqual({
        headers: { 'x-debug-id': 'visible-id' },
        transform: 'json.output',
        maxResponseTokens: 256,
      });
      expect(persisted.tests[0].options).toEqual({
        headers: { 'X-Trace-Id': 'visible-trace' },
      });
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('prompt-leak-apikey');
      expect(serialized).not.toContain('prompt-leak-token');
      expect(serialized).not.toContain('provider-honeycomb-key');
      expect(serialized).not.toContain('neutral-header-token');
      expect(serialized).not.toContain('default-options-token');
      expect(serialized).not.toContain('test-options-key');
    });

    it('redacts tracing forwarding headers without dropping non-auth tracing config', () => {
      useStore.getState().setConfig({
        tracing: {
          enabled: true,
          forwarding: {
            enabled: true,
            endpoint:
              'https://collector-user:collector-password@otel.example.com/v1/traces?token=tracing-url-secret',
            headers: {
              Authorization: 'Bearer tracing-leak-token',
              'X-Auth': 'tracing-leak-x-auth',
              'X-Honeycomb-Team': 'honeycomb-ingest-key',
              'X-Collector': 'Bearer neutral-tracing-token-1234567890',
              'X-Forwarded-Authorization': 'Bearer {{ otlp_token | trim }}',
              'X-Service': 'visible-service',
              'X-Request-Id': 'visible-request-id',
            },
          },
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.tracing.enabled).toBe(true);
      expect(persisted.tracing.forwarding.endpoint).toContain('otel.example.com/v1/traces');
      expect(persisted.tracing.forwarding.headers).toEqual({
        'X-Forwarded-Authorization': 'Bearer {{ otlp_token | trim }}',
        'X-Service': 'visible-service',
        'X-Request-Id': 'visible-request-id',
      });
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('tracing-leak-token');
      expect(serialized).not.toContain('tracing-leak-x-auth');
      expect(serialized).not.toContain('honeycomb-ingest-key');
      expect(serialized).not.toContain('neutral-tracing-token');
      expect(serialized).not.toContain('collector-password');
      expect(serialized).not.toContain('tracing-url-secret');
    });

    it('redacts raw HTTP request strings and multipart form-field values', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              url: 'https://api.example.com/v1/predict',
              request: [
                'POST /{{ path }}?api_key=raw-target-secret HTTP/1.1',
                'Host: api.example.com',
                'Authorization: Bearer raw-request-secret',
                'X-Api-Key: raw-request-apikey',
                'X-Client-Secret: raw-request-client-secret',
                'X-Session-Token: raw-request-session-token',
                'Cookie: session=raw-request-cookie',
                'Content-Type: application/json',
                '',
                '{"prompt":"{{message}}","api_key":"raw-body-secret"}',
              ].join('\r\n'),
              body: {
                parts: [
                  { kind: 'field', name: 'api_key', value: 'multipart-leak-apikey' },
                  { kind: 'field', name: 'api_key', value: '{{ multipart_api_key }}' },
                  { kind: 'field', name: 'authorization', value: 'multipart-leak-auth' },
                  { kind: 'field', name: 'auth', value: 'multipart-leak-bare-auth' },
                  {
                    kind: 'field',
                    name: 'metadata',
                    value: '{"api_key":"multipart-json-secret","prompt":"visible metadata"}',
                  },
                  {
                    kind: 'field',
                    name: 'payload',
                    value: 'sk-structuredmultipartabcdefghijklmnopqrstuvwxyz123456',
                  },
                  { kind: 'field', name: 'prompt', value: '{{message}}' },
                  {
                    kind: 'file',
                    name: 'document',
                    source: { type: 'path', path: '/tmp/doc.pdf' },
                  },
                ],
              },
            } as any,
          },
          {
            id: 'http',
            config: {
              request: [
                'POST /services/T/B/sk-abcdefghijklmnopqrstuvwxyz1234567890 HTTP/1.1',
                'Host: hooks.example.test',
                'Content-Type: multipart/form-data; boundary=boundary-value',
                '',
                '--boundary-value',
                'Content-Disposition: form-data; name="api_key"',
                '',
                'raw-multipart-secret',
                '--boundary-value',
                'Content-Disposition: form-data; name=pwd',
                '',
                'raw-multipart-password',
                '--boundary-value',
                'Content-Disposition: form-data; name="payload"',
                '',
                'sk-neutralmultipartabcdefghijklmnopqrstuvwxyz123456',
                '--boundary-value',
                'Content-Disposition: form-data; name="endpoint"',
                '',
                'https://raw-user:raw-password@api.example.test/submit',
                '--boundary-value',
                'Content-Disposition: form-data; name="metadata"',
                '',
                '{"api_key":"raw-json-part-secret","prompt":"visible embedded prompt"}',
                '--boundary-value',
                'Content-Disposition: form-data; name="prompt"',
                '',
                'visible multipart prompt',
                '--boundary-value--',
              ].join('\r\n'),
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      const cfg = persisted.providers[0].config;
      expect(cfg.url).toBe('https://api.example.com/v1/predict');
      expect(cfg.request).toContain('Authorization: [REDACTED]');
      expect(cfg.request).toContain('X-Api-Key: [REDACTED]');
      expect(cfg.request).toContain('X-Client-Secret: [REDACTED]');
      expect(cfg.request).toContain('X-Session-Token: [REDACTED]');
      expect(cfg.request).toContain('Cookie: [REDACTED]');
      expect(cfg.request).toContain('Host: api.example.com');
      expect(cfg.request).toContain('POST /{{ path }}?api_key=[REDACTED] HTTP/1.1');
      expect(cfg.request).toContain('"prompt":"{{message}}"');
      expect(cfg.body.parts).toEqual([
        { kind: 'field', name: 'api_key' },
        { kind: 'field', name: 'api_key', value: '{{ multipart_api_key }}' },
        { kind: 'field', name: 'authorization' },
        { kind: 'field', name: 'auth' },
        { kind: 'field', name: 'metadata', value: '{"prompt":"visible metadata"}' },
        { kind: 'field', name: 'payload', value: '[REDACTED]' },
        { kind: 'field', name: 'prompt', value: '{{message}}' },
        { kind: 'file', name: 'document', source: { type: 'path', path: '/tmp/doc.pdf' } },
      ]);
      const rawMultipartRequest = persisted.providers[1].config.request;
      expect(rawMultipartRequest).toContain('POST /services/T/B/[REDACTED] HTTP/1.1');
      expect(rawMultipartRequest).toContain('[REDACTED]');
      expect(rawMultipartRequest).toContain('visible multipart prompt');
      expect(rawMultipartRequest).toContain('visible embedded prompt');
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('raw-request-secret');
      expect(serialized).not.toContain('raw-request-apikey');
      expect(serialized).not.toContain('raw-request-client-secret');
      expect(serialized).not.toContain('raw-request-session-token');
      expect(serialized).not.toContain('raw-request-cookie');
      expect(serialized).not.toContain('raw-target-secret');
      expect(serialized).not.toContain('raw-body-secret');
      expect(serialized).not.toContain('multipart-leak-apikey');
      expect(serialized).not.toContain('multipart-leak-auth');
      expect(serialized).not.toContain('multipart-leak-bare-auth');
      expect(serialized).not.toContain('raw-multipart-secret');
      expect(serialized).not.toContain('raw-multipart-password');
      expect(serialized).not.toContain('sk-neutralmultipartabcdefghijklmnopqrstuvwxyz123456');
      expect(serialized).not.toContain('raw-password');
      expect(serialized).not.toContain('multipart-json-secret');
      expect(serialized).not.toContain('sk-structuredmultipartabcdefghijklmnopqrstuvwxyz123456');
      expect(serialized).not.toContain('raw-json-part-secret');
      expect(serialized).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234567890');
    });

    it('redacts credentials embedded in provider URL strings and URL configuration', () => {
      useStore.getState().setConfig({
        providers: [
          'https://browser-user:browser-password@api.example.com/v1?api_key=provider-url-secret&region=us',
          {
            id: 'http',
            config: {
              url: 'https://api.example.com/v1?token=config-url-secret&max_tokens=128&region=us',
            },
          },
          {
            id: 'http',
            config: {
              url: 'https://api.example.com/{{ path }}?x-api-key=templated-url-secret&api_key={{ api_token }}&region=us',
            },
          },
          'https://templated-user:templated-password@api.example.com/{{ model }}',
          'https://{{ username }}:{{ password }}@api.example.com/{{ model }}',
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('browser-user');
      expect(serialized).not.toContain('browser-password');
      expect(serialized).not.toContain('provider-url-secret');
      expect(serialized).not.toContain('config-url-secret');
      expect(serialized).not.toContain('templated-url-secret');
      expect(serialized).not.toContain('templated-password');
      expect(persisted.providers[0]).toContain('region=us');
      expect(persisted.providers[1].config.url).toContain('region=us');
      expect(persisted.providers[1].config.url).toContain('max_tokens=128');
      expect(persisted.providers[2].config.url).toContain('api_key={{ api_token }}');
      expect(persisted.providers[4]).toContain('{{ username }}:{{ password }}');
    });

    it('redacts credentials embedded in sharing endpoints', () => {
      useStore.getState().setConfig({
        sharing: {
          apiBaseUrl:
            'https://share-user:share-password@share.example.com?api_key=share-secret&region=us',
          appBaseUrl: 'https://app.example.com/evals?token=view-secret&theme=dark',
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.sharing).toEqual({
        apiBaseUrl: 'https://[REDACTED]@share.example.com?api_key=[REDACTED]&region=us',
        appBaseUrl: 'https://app.example.com/evals?token=[REDACTED]&theme=dark',
      });
      expect(JSON.stringify(persisted)).not.toContain('share-user');
      expect(JSON.stringify(persisted)).not.toContain('share-password');
      expect(JSON.stringify(persisted)).not.toContain('share-secret');
      expect(JSON.stringify(persisted)).not.toContain('view-secret');
    });

    it('redacts provider identifiers in option maps and test filters', () => {
      const provider =
        'https://map-user:map-password@api.example.com/v1?token=map-secret&region=us';
      const scrubbedProvider = 'https://[REDACTED]@api.example.com/v1?token=[REDACTED]&region=us';
      useStore.getState().setConfig({
        providers: [{ [provider]: { config: { region: 'us' } } }],
        defaultTest: { providers: [provider] },
        tests: [{ providers: [provider] }],
        scenarios: [{ tests: [{ providers: [provider] }] }],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers).toEqual([{ [scrubbedProvider]: { config: { region: 'us' } } }]);
      expect(persisted.defaultTest.providers).toEqual([scrubbedProvider]);
      expect(persisted.tests[0].providers).toEqual([scrubbedProvider]);
      expect(persisted.scenarios[0].tests[0].providers).toEqual([scrubbedProvider]);
      expect(JSON.stringify(persisted)).not.toContain('map-user');
      expect(JSON.stringify(persisted)).not.toContain('map-password');
      expect(JSON.stringify(persisted)).not.toContain('map-secret');
    });

    it('redacts provider identifiers in raw editor providerPromptMap fields', () => {
      const provider =
        'https://router-user:router-password@api.example.com/v1?token=routing-secret&region=us';
      useStore.getState().setConfig({
        providers: [provider],
        prompts: ['main'],
        providerPromptMap: { [provider]: ['main'] },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providerPromptMap).toEqual({
        'https://[REDACTED]@api.example.com/v1?token=[REDACTED]&region=us': ['main'],
      });
      expect(JSON.stringify(persisted)).not.toContain('router-user');
      expect(JSON.stringify(persisted)).not.toContain('router-password');
      expect(JSON.stringify(persisted)).not.toContain('routing-secret');
    });

    it('redacts credential-bearing command-line provider options', () => {
      useStore.getState().setConfig({
        commandLineOptions: {
          grader:
            'https://grader-user:grader-password@grader.example.com/v1?api_key=grader-secret&mode=strict',
          providers: [
            'https://target-user:target-password@target.example.com/v1?token=target-secret&region=us',
            'openai:gpt-4o-mini',
          ],
          vars: 'az://account/container/tests.csv?sp=r&sig=command-line-sas-secret',
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.commandLineOptions).toEqual({
        grader: 'https://[REDACTED]@grader.example.com/v1?api_key=[REDACTED]&mode=strict',
        providers: [
          'https://[REDACTED]@target.example.com/v1?token=[REDACTED]&region=us',
          'openai:gpt-4o-mini',
        ],
        vars: 'az://account/container/tests.csv?sp=r&sig=%5BREDACTED%5D',
      });
      expect(JSON.stringify(persisted)).not.toContain('grader-password');
      expect(JSON.stringify(persisted)).not.toContain('grader-secret');
      expect(JSON.stringify(persisted)).not.toContain('target-password');
      expect(JSON.stringify(persisted)).not.toContain('target-secret');
      expect(JSON.stringify(persisted)).not.toContain('command-line-sas-secret');
    });

    it('redacts credentials in HTTP body strings', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              body: 'client_secret=form-body-secret&pwd=form-password-secret&grant_type=client_credentials',
            },
          },
          {
            id: 'http',
            config: {
              body: '{"api_key":"json-body-secret","prompt":"hello"}',
            },
          },
          {
            id: 'http',
            config: {
              body: '{"payload":"sk-abcdefghijklmnopqrstuvwxyz1234567890","database":"https://json-user:json-password@db.example.test/app"}',
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('form-body-secret');
      expect(serialized).not.toContain('form-password-secret');
      expect(serialized).not.toContain('json-body-secret');
      expect(serialized).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
      expect(serialized).not.toContain('json-password');
      expect(persisted.providers[0].config.body).toContain('grant_type=client_credentials');
      expect(persisted.providers[1].config.body).toContain('"prompt":"hello"');
    });

    it('preserves templated credential references while stripping literal values', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              auth: {
                type: 'bearer',
                token: '{{ api_token | trim }}',
                clientSecret: 'literal-auth-secret',
                password: '{{ api_token | default("embedded-default-secret") }}',
              },
              headers: {
                Authorization: 'Bearer {{ env.API_TOKEN | trim }}',
                'X-API-Key': 'literal-header-secret',
              },
              request: [
                'POST /v1?api_key={{ api_token | urlencode }} HTTP/1.1',
                'Authorization: Bearer {{ env.API_TOKEN | trim }}',
                '',
                'client_secret={{ client_secret }}&api_key=literal-body-secret',
              ].join('\r\n'),
            },
          },
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      const config = persisted.providers[0].config;
      expect(config.auth.token).toBe('{{ api_token | trim }}');
      expect(config.headers).toEqual({ Authorization: 'Bearer {{ env.API_TOKEN | trim }}' });
      expect(config.request).toContain('api_key={{ api_token | urlencode }}');
      expect(config.request).toContain('Authorization: Bearer {{ env.API_TOKEN | trim }}');
      expect(config.request).toContain('client_secret={{ client_secret }}');
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('literal-auth-secret');
      expect(serialized).not.toContain('literal-header-secret');
      expect(serialized).not.toContain('literal-body-secret');
      expect(serialized).not.toContain('embedded-default-secret');
    });

    it('preserves public TLS certificate material while redacting private material', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              tls: {
                cert: '-----BEGIN CERTIFICATE-----inline-cert-pem-secret-----END CERTIFICATE-----',
                ca: '-----BEGIN CERTIFICATE-----inline-ca-secret-----END CERTIFICATE-----',
                keyContent: 'base64-key-content-secret',
                certPath: '/var/run/certs/client.crt',
                caPath: '/var/run/certs/ca.crt',
                keyPath: '/var/run/certs/client.key',
              },
            } as any,
          },
        ],
      });

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers[0].config.tls).toEqual({
        cert: '-----BEGIN CERTIFICATE-----inline-cert-pem-secret-----END CERTIFICATE-----',
        ca: '-----BEGIN CERTIFICATE-----inline-ca-secret-----END CERTIFICATE-----',
        certPath: '/var/run/certs/client.crt',
        caPath: '/var/run/certs/ca.crt',
        keyPath: '/var/run/certs/client.key',
      });
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('base64-key-content-secret');
    });

    it('fails closed on cyclic provider config rather than persisting raw secrets', () => {
      const cyclic: Record<string, unknown> = {
        id: 'http',
        config: { apiKey: 'cyclic-leak-secret', endpoint: 'https://example.com' },
      };
      (cyclic.config as Record<string, unknown>).self = cyclic;

      useStore.getState().setConfig({ providers: [cyclic as any] } as any);

      const serialized = localStorage.getItem('promptfoo') ?? '';
      expect(serialized).not.toContain('cyclic-leak-secret');
      const persisted = JSON.parse(serialized).state.config;
      // Walker resolves the cycle by dropping the offending subtree, and the
      // outer apiKey is still stripped by name.
      const cfg = (persisted.providers ?? [])[0]?.config;
      if (cfg) {
        expect(cfg.apiKey).toBeUndefined();
      }
    });

    it('preserves shared provider references while sanitizing every occurrence', () => {
      const sharedProvider = {
        id: 'http',
        config: {
          apiKey: 'shared-provider-secret',
          endpoint: 'https://api.example.com',
        },
      };

      useStore.getState().setConfig({
        providers: [sharedProvider as any, sharedProvider as any],
      });

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.providers).toEqual([
        { id: 'http', config: { endpoint: 'https://api.example.com' } },
        { id: 'http', config: { endpoint: 'https://api.example.com' } },
      ]);
      expect(JSON.stringify(persisted)).not.toContain('shared-provider-secret');
    });

    it('does not corrupt JSON schemas inside provider tools/functions', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'openai:gpt-4o',
            config: {
              apiKey: 'tool-test-secret',
              tools: [
                {
                  type: 'function',
                  function: {
                    name: 'authenticate_user',
                    description: 'Authenticate with API key and password',
                    parameters: {
                      type: 'object',
                      properties: {
                        api_key: { type: 'string', description: 'User API key' },
                        password: { type: 'string', description: 'User password' },
                        token: { type: 'string' },
                        cert: { type: 'string' },
                      },
                      required: ['api_key', 'password'],
                    },
                  },
                },
                {
                  type: 'mcp',
                  server_label: 'private-mcp',
                  server_url:
                    'https://mcp-user:mcp-password@mcp.example.com/connect?token=mcp-url-secret&api_key={{ mcp_api_key }}',
                  headers: {
                    Authorization: 'Bearer mcp-header-secret',
                    'X-API-Key': '{{ mcp_api_key }}',
                    'X-Trace-Id': 'visible-tool-trace',
                  },
                  authorization: 'Bearer xai-mcp-authorization-secret',
                },
              ],
              response_format: {
                type: 'json_schema',
                json_schema: {
                  name: 'creds',
                  schema: {
                    type: 'object',
                    properties: {
                      secret: { type: 'string' },
                      authorization: { type: 'string' },
                    },
                  },
                },
              },
              functions: [
                {
                  name: 'legacy_authenticate_user',
                  parameters: {
                    type: 'object',
                    properties: {
                      password: { type: 'string' },
                      api_key: { type: 'string' },
                    },
                    required: ['password'],
                  },
                },
              ],
            } as any,
          },
        ],
      });

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      const providerCfg = persisted.providers[0].config;
      expect(providerCfg.apiKey).toBeUndefined();
      expect(providerCfg.tools[0].function.parameters.properties).toEqual({
        api_key: { type: 'string', description: 'User API key' },
        password: { type: 'string', description: 'User password' },
        token: { type: 'string' },
        cert: { type: 'string' },
      });
      expect(providerCfg.tools[0].function.parameters.required).toEqual(['api_key', 'password']);
      expect(providerCfg.tools[1].server_url).toContain('mcp.example.com/connect');
      expect(providerCfg.tools[1].server_url).toContain('api_key={{ mcp_api_key }}');
      expect(providerCfg.tools[1].headers).toEqual({
        'X-API-Key': '{{ mcp_api_key }}',
        'X-Trace-Id': 'visible-tool-trace',
      });
      expect(JSON.stringify(providerCfg.tools[1])).not.toContain('mcp-password');
      expect(JSON.stringify(providerCfg.tools[1])).not.toContain('mcp-url-secret');
      expect(JSON.stringify(providerCfg.tools[1])).not.toContain('mcp-header-secret');
      expect(JSON.stringify(providerCfg.tools[1])).not.toContain('xai-mcp-authorization-secret');
      expect(providerCfg.response_format.json_schema.schema.properties).toEqual({
        secret: { type: 'string' },
        authorization: { type: 'string' },
      });
      expect(providerCfg.functions[0].parameters.properties).toEqual({
        password: { type: 'string' },
        api_key: { type: 'string' },
      });
      expect(providerCfg.functions[0].parameters.required).toEqual(['password']);
    });

    it('redacts inline auth and certificate material while retaining signing configuration', () => {
      useStore.getState().updateConfig({
        providers: [
          {
            id: 'http',
            config: {
              auth: {
                type: 'api_key',
                value: 'auth-secret',
                placement: 'header',
                keyName: 'X-API-Key',
              },
              tls: {
                pfx: 'tls-pfx-secret',
                pfxPath: '/var/run/certs/client.p12',
                jksContent: 'tls-jks-secret',
                jksPath: '/var/run/certs/client.jks',
                passphrase: 'tls-passphrase-secret',
              },
              signatureAuth: {
                type: 'pfx',
                pfxContent: 'signature-pfx-secret',
                keystoreContent: 'signature-keystore-secret',
                certificateContent: 'signature-certificate-secret',
                certContent: 'signature-public-cert',
                keyContent: 'signature-key-secret',
                pfxPassword: 'signature-password-secret',
                pfxPath: '/var/run/certs/signing.p12',
                signatureAlgorithm: 'SHA256',
                signatureDataTemplate: '{{body}}',
                signatureValidityMs: 300_000,
              },
            } as any,
          },
        ],
      });

      const persistedConfig = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persistedConfig.providers[0].config).toEqual({
        auth: {
          type: 'api_key',
          placement: 'header',
          keyName: 'X-API-Key',
        },
        tls: {
          pfxPath: '/var/run/certs/client.p12',
          jksPath: '/var/run/certs/client.jks',
        },
        signatureAuth: {
          type: 'pfx',
          certContent: 'signature-public-cert',
          pfxPath: '/var/run/certs/signing.p12',
          signatureAlgorithm: 'SHA256',
          signatureDataTemplate: '{{body}}',
          signatureValidityMs: 300_000,
        },
      });
      expect(JSON.stringify(persistedConfig)).not.toContain('-secret');
    });

    it('redacts credentials inside test generator configuration objects', () => {
      useStore.getState().setConfig({
        tests: [
          {
            path: 'file://generate-tests.ts',
            config: {
              apiKey: 'generator-api-key-secret',
              endpoint: 'https://generator.example.com?token=generator-url-secret',
              dataset: 'truthfulqa',
            },
          },
        ],
      } as any);

      let persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.tests[0]).toEqual({
        path: 'file://generate-tests.ts',
        config: {
          endpoint: 'https://generator.example.com?token=[REDACTED]',
          dataset: 'truthfulqa',
        },
      });
      expect(JSON.stringify(persisted)).not.toContain('generator-api-key-secret');
      expect(JSON.stringify(persisted)).not.toContain('generator-url-secret');

      useStore.getState().setConfig({
        tests: {
          path: 'file://generate-tests.py',
          config: { clientSecret: 'standalone-generator-secret', split: 'validation' },
        },
      } as any);

      persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.tests).toEqual({
        path: 'file://generate-tests.py',
        config: { split: 'validation' },
      });
      expect(JSON.stringify(persisted)).not.toContain('standalone-generator-secret');
    });
    it('keeps oversized edit configs in memory while compacting persisted state', () => {
      const largeConfig = {
        description: 'Large config',
        prompts: ['Prompt'],
        providers: ['echo'],
        defaultTest: { vars: { large: 'x'.repeat(1_000_000) } },
        scenarios: [{ config: { large: 'x'.repeat(1_000_000) }, tests: [] }],
        tests: [{ vars: { large: 'x'.repeat(1_000_000) } }],
      } as unknown as Partial<UnifiedConfig>;

      useStore.getState().setConfig(largeConfig);

      expect(useStore.getState().config.tests).toHaveLength(1);
      const persistableConfig = getPersistableEvalConfig(useStore.getState().config);
      expect(persistableConfig.description).toBe('Large config');
      expect(persistableConfig.tests).toEqual([]);
      expect(persistableConfig.defaultTest).toEqual({});
      expect(persistableConfig.scenarios).toEqual([]);
    });

    it('redacts small configs before persistence', () => {
      const config = {
        description: 'Small config',
        env: { OPENAI_API_KEY: 'secret', REGION: 'us-east-1' },
        providers: ['echo'],
        prompts: ['hello'],
      } as Partial<UnifiedConfig>;

      expect(getPersistableEvalConfig(config)).toEqual({
        ...config,
        env: { REGION: 'us-east-1' },
      });
    });

    it('falls back to lightweight fields when compacted configs are still too large', () => {
      const config = {
        description: 'Huge config',
        providers: ['echo'],
        prompts: ['x'.repeat(MAX_PERSISTED_EVAL_CONFIG_BYTES + 1)],
        tests: [{ vars: { topic: 'details' } }],
        defaultTest: { vars: { topic: 'default' } },
        scenarios: [{ config: { topic: 'scenario' }, tests: [] }],
      } as unknown as Partial<UnifiedConfig>;

      expect(getPersistableEvalConfig(config)).toEqual({
        ...DEFAULT_CONFIG,
        description: 'Huge config',
        providers: ['echo'],
        prompts: [],
      });
    });

    it('fails closed when config serialization fails', () => {
      const config = {
        description: 'Circular config',
        providers: ['echo'],
      } as Record<string, unknown>;
      config.extra = config;

      expect(getPersistableEvalConfig(config as Partial<UnifiedConfig>)).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('defaultTest handling', () => {
    it('should accept string defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });

      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);
    });

    it('should accept object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
        options: { provider: 'openai:gpt-4' },
      };

      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });

      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);
    });

    it('should handle undefined defaultTest', () => {
      // Set to undefined explicitly
      useStore.getState().updateConfig({ defaultTest: undefined as any });

      // When set to undefined, it becomes undefined
      expect(useStore.getState().config.defaultTest).toBeUndefined();
    });

    it('should update from object to string defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });
      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);

      const stringDefaultTest = 'file://new/path/defaultTest.yaml';
      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });

      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);
    });

    it('should update from string to object defaultTest', () => {
      const stringDefaultTest = 'file://path/to/defaultTest.yaml';

      useStore.getState().updateConfig({ defaultTest: stringDefaultTest });
      expect(useStore.getState().config.defaultTest).toBe(stringDefaultTest);

      const objectDefaultTest = {
        assert: [{ type: 'contains' as const, value: 'new' }],
        metadata: { suite: 'test' },
      };
      useStore.getState().updateConfig({ defaultTest: objectDefaultTest as any });

      expect(useStore.getState().config.defaultTest).toEqual(objectDefaultTest);
    });
  });

  describe('getTestSuite', () => {
    it('should return config with string defaultTest', () => {
      const stringDefaultTest = 'file://shared/defaultTest.yaml';

      useStore.getState().updateConfig({
        description: 'Test config',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
        defaultTest: stringDefaultTest,
      });

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toBe(stringDefaultTest);
      expect(config.description).toBe('Test config');
    });

    it('should return config with object defaultTest', () => {
      const objectDefaultTest = {
        assert: [{ type: 'equals' as const, value: 'test' }],
        vars: { foo: 'bar' },
      };

      useStore.getState().updateConfig({
        description: 'Test config',
        providers: [{ id: 'openai:gpt-4' }],
        prompts: ['Test prompt'],
        defaultTest: objectDefaultTest as any,
      });

      const config = useStore.getState().getTestSuite();

      expect(config.defaultTest).toEqual(objectDefaultTest);
    });

    it('should handle complex prompts configuration', () => {
      // Test string prompts
      useStore.getState().updateConfig({ prompts: ['Test prompt'] });
      expect(useStore.getState().config.prompts).toEqual(['Test prompt']);

      // Test array of prompts
      const multiplePrompts = ['Prompt 1', 'Prompt 2'];
      useStore.getState().updateConfig({ prompts: multiplePrompts });
      expect(useStore.getState().config.prompts).toEqual(multiplePrompts);
    });

    it('should include new fields like derivedMetrics automatically', () => {
      const derivedMetrics = [
        { name: 'precision', value: 'tp / (tp + fp)' },
        { name: 'recall', value: 'tp / (tp + fn)' },
      ];

      useStore.getState().updateConfig({ derivedMetrics });

      const testSuite = useStore.getState().getTestSuite();
      expect(testSuite.derivedMetrics).toEqual(derivedMetrics);
    });
  });
});
