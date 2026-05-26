import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, useStore } from './evalConfig';

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
        redteam: { provider: provider('redteam-secret') },
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
      expect(JSON.stringify(persistedConfig)).not.toContain('-secret');
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
      // LANGFUSE_PUBLIC_KEY ends in `_KEY`; we treat it as a secret-by-default
      // because the regex cannot tell a "public" key from a "secret" key.
      expect(persisted.env.LANGFUSE_PUBLIC_KEY).toBeUndefined();
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
              headers: { Authorization: 'Bearer prompt-leak-token', 'x-trace-id': 'visible' },
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
      expect(serialized).not.toContain('default-options-token');
      expect(serialized).not.toContain('test-options-key');
    });

    it('redacts tracing forwarding headers without dropping non-auth tracing config', () => {
      useStore.getState().setConfig({
        tracing: {
          enabled: true,
          forwarding: {
            enabled: true,
            endpoint: 'https://otel.example.com/v1/traces',
            headers: {
              Authorization: 'Bearer tracing-leak-token',
              'X-Auth': 'tracing-leak-x-auth',
              'X-Service': 'visible-service',
              'X-Request-Id': 'visible-request-id',
            },
          },
        },
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      expect(persisted.tracing.enabled).toBe(true);
      expect(persisted.tracing.forwarding.endpoint).toBe('https://otel.example.com/v1/traces');
      expect(persisted.tracing.forwarding.headers).toEqual({
        'X-Service': 'visible-service',
        'X-Request-Id': 'visible-request-id',
      });
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('tracing-leak-token');
      expect(serialized).not.toContain('tracing-leak-x-auth');
    });

    it('redacts raw HTTP request strings and multipart form-field values', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              url: 'https://api.example.com/v1/predict',
              request: [
                'POST /v1/predict HTTP/1.1',
                'Host: api.example.com',
                'Authorization: Bearer raw-request-secret',
                'X-Api-Key: raw-request-apikey',
                'Cookie: session=raw-request-cookie',
                'Content-Type: application/json',
                '',
                '{"prompt":"{{message}}"}',
              ].join('\r\n'),
              body: {
                parts: [
                  { kind: 'field', name: 'api_key', value: 'multipart-leak-apikey' },
                  { kind: 'field', name: 'authorization', value: 'multipart-leak-auth' },
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
        ],
      } as any);

      const persisted = JSON.parse(localStorage.getItem('promptfoo') || '{}').state.config;
      const cfg = persisted.providers[0].config;
      expect(cfg.url).toBe('https://api.example.com/v1/predict');
      expect(cfg.request).toContain('Authorization: [REDACTED]');
      expect(cfg.request).toContain('X-Api-Key: [REDACTED]');
      expect(cfg.request).toContain('Cookie: [REDACTED]');
      expect(cfg.request).toContain('Host: api.example.com');
      expect(cfg.request).toContain('{"prompt":"{{message}}"}');
      expect(cfg.body.parts).toEqual([
        { kind: 'field', name: 'api_key' },
        { kind: 'field', name: 'authorization' },
        { kind: 'field', name: 'prompt', value: '{{message}}' },
        { kind: 'file', name: 'document', source: { type: 'path', path: '/tmp/doc.pdf' } },
      ]);
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('raw-request-secret');
      expect(serialized).not.toContain('raw-request-apikey');
      expect(serialized).not.toContain('raw-request-cookie');
      expect(serialized).not.toContain('multipart-leak-apikey');
      expect(serialized).not.toContain('multipart-leak-auth');
    });

    it('redacts inline TLS cert/ca/key material while preserving file paths', () => {
      useStore.getState().setConfig({
        providers: [
          {
            id: 'http',
            config: {
              tls: {
                cert: '-----BEGIN CERTIFICATE-----inline-cert-pem-secret-----END CERTIFICATE-----',
                certContent: 'base64-cert-content-secret',
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
        certPath: '/var/run/certs/client.crt',
        caPath: '/var/run/certs/ca.crt',
        keyPath: '/var/run/certs/client.key',
      });
      const serialized = JSON.stringify(persisted);
      expect(serialized).not.toContain('inline-cert-pem-secret');
      expect(serialized).not.toContain('base64-cert-content-secret');
      expect(serialized).not.toContain('inline-ca-secret');
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
      expect(providerCfg.response_format.json_schema.schema.properties).toEqual({
        secret: { type: 'string' },
        authorization: { type: 'string' },
      });
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
          pfxPath: '/var/run/certs/signing.p12',
          signatureAlgorithm: 'SHA256',
          signatureDataTemplate: '{{body}}',
          signatureValidityMs: 300_000,
        },
      });
      expect(JSON.stringify(persistedConfig)).not.toContain('-secret');
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
