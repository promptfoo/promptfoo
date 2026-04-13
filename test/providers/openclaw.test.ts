import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildOpenClawModelName,
  createOpenClawProvider,
  OpenClawAgentProvider,
  OpenClawChatProvider,
  OpenClawEmbeddingProvider,
  OpenClawResponsesProvider,
  OpenClawToolInvokeProvider,
  readOpenClawConfig,
  resetConfigCache,
  resolveAuthToken,
  resolveGatewayUrl,
  resolveGatewayWsUrl,
} from '../../src/providers/openclaw';

vi.mock('../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/envars')>();
  return {
    ...actual,
    getEnvString: vi.fn((key: string) => process.env[key]),
  };
});

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const websocketMocks = vi.hoisted(() => {
  let factory: (() => any) | null = null;

  const WebSocketMock = vi.fn(function (_url: string, ..._args: any[]) {
    return factory?.() ?? {};
  });

  const setFactory = (nextFactory: () => any) => {
    factory = nextFactory;
  };

  return { WebSocketMock, setFactory };
});

vi.mock('ws', () => ({
  default: websocketMocks.WebSocketMock,
}));

const mockFetchWithProxy = vi.hoisted(() => vi.fn());
vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: mockFetchWithProxy,
}));

const mockFetchWithCache = vi.hoisted(() => vi.fn());
vi.mock('../../src/cache', () => ({
  fetchWithCache: mockFetchWithCache,
}));

const deviceAuthMocks = vi.hoisted(() => ({
  buildSignedOpenClawDevice: vi.fn(),
  clearOpenClawDeviceAuthToken: vi.fn(),
  loadOpenClawDeviceAuthToken: vi.fn(),
  loadOrCreateOpenClawDeviceIdentity: vi.fn(),
  storeOpenClawDeviceAuthToken: vi.fn(),
}));
vi.mock('../../src/providers/openclaw/device-auth', () => deviceAuthMocks);

describe('OpenClaw Provider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    websocketMocks.WebSocketMock.mockReset();
    mockFetchWithProxy.mockReset();
    mockFetchWithCache.mockReset();
    resetConfigCache();
    deviceAuthMocks.buildSignedOpenClawDevice.mockReset();
    deviceAuthMocks.clearOpenClawDeviceAuthToken.mockReset();
    deviceAuthMocks.loadOpenClawDeviceAuthToken.mockReset();
    deviceAuthMocks.loadOrCreateOpenClawDeviceIdentity.mockReset();
    deviceAuthMocks.storeOpenClawDeviceAuthToken.mockReset();
    deviceAuthMocks.loadOrCreateOpenClawDeviceIdentity.mockReturnValue({
      deviceId: 'device-1',
      publicKeyPem: 'public-key-pem',
      privateKeyPem: 'private-key-pem',
    });
    deviceAuthMocks.buildSignedOpenClawDevice.mockImplementation((params: any) => ({
      id: params.identity.deviceId,
      publicKey: 'public-key',
      signature: `signature:${params.nonce}:${params.token ?? ''}`,
      signedAt: 1234,
      nonce: params.nonce,
    }));
    deviceAuthMocks.loadOpenClawDeviceAuthToken.mockReturnValue(undefined);
    process.env = { ...originalEnv };
    delete process.env.CLAWDBOT_GATEWAY_PASSWORD;
    delete process.env.CLAWDBOT_GATEWAY_TOKEN;
    delete process.env.CLAWDBOT_GATEWAY_URL;
    delete process.env.OPENCLAW_CONFIG_PATH;
    delete process.env.OPENCLAW_GATEWAY_PASSWORD;
    delete process.env.OPENCLAW_GATEWAY_PORT;
    delete process.env.OPENCLAW_GATEWAY_URL;
    delete process.env.OPENCLAW_GATEWAY_TOKEN;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('readOpenClawConfig', () => {
    it('should return undefined when config file does not exist', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(readOpenClawConfig()).toBeUndefined();
    });

    it('should respect OPENCLAW_CONFIG_PATH when set', () => {
      process.env.OPENCLAW_CONFIG_PATH = '/tmp/custom-openclaw.json';
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      readOpenClawConfig();

      expect(existsSpy).toHaveBeenCalledWith('/tmp/custom-openclaw.json');
    });

    it('should parse valid JSON config', () => {
      const configContent = JSON.stringify({
        gateway: {
          port: 19000,
          auth: {
            mode: 'token',
            token: 'test-token-abc123',
          },
        },
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 1000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(configContent);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
      expect(config?.gateway?.auth?.token).toBe('test-token-abc123');
    });

    it('should handle JSON5 with comments and trailing commas', () => {
      const json5Content = `{
        // This is a comment
        "gateway": {
          "port": 19000,
          "auth": {
            "token": "my-token",
          },
        },
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 2000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
      expect(config?.gateway?.auth?.token).toBe('my-token');
    });

    it('should parse an upstream-style OpenClaw config with unquoted keys', () => {
      const json5Content = `{
        gateway: {
          mode: 'local',
          bind: 'loopback',
          port: 19000,
          auth: {
            mode: 'token',
            token: 'my-token',
          },
          http: {
            endpoints: {
              chatCompletions: { enabled: true },
              responses: { enabled: true },
            },
          },
        },
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 2500 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
      expect(config?.gateway?.auth?.token).toBe('my-token');
      expect(config?.gateway?.http?.endpoints?.chatCompletions?.enabled).toBe(true);
    });

    it('should handle JSON5 with block comments', () => {
      const json5Content = `{
        /* block comment */
        "gateway": {
          "port": 19000
        }
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 3000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
    });

    it('should preserve URLs in strings when stripping comments', () => {
      const json5Content = `{
        // This is a comment
        "gateway": {
          "port": 19000,
          "url": "http://example.com/path"
        }
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 4000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect(config?.gateway?.port).toBe(19000);
      expect((config?.gateway as any)?.url).toBe('http://example.com/path');
    });

    it('should preserve comment-like content inside strings', () => {
      const json5Content = `{
        "gateway": {
          "port": 19000,
          "note": "it's a // test"
        }
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 4100 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect((config?.gateway as any)?.note).toBe("it's a // test");
    });

    it('should preserve // inside strings when stripping comments', () => {
      const json5Content = `{
        // real comment
        "gateway": {
          "port": 19000,
          "bind": "http://192.168.1.1:8080"
        }
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 4200 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect((config?.gateway as any)?.bind).toBe('http://192.168.1.1:8080');
    });

    it('should preserve /* inside strings when stripping block comments', () => {
      const json5Content = `{
        /* block comment */
        "gateway": {
          "port": 19000,
          "note": "this /* is not */ a comment"
        }
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 4300 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect((config?.gateway as any)?.note).toBe('this /* is not */ a comment');
    });

    it('should handle unclosed block comment gracefully', () => {
      const json5Content = `/* unclosed block comment
      { "gateway": { "port": 19000 } }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 4500 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      // Unclosed block comment consumes remaining content; returns undefined (parse error)
      const config = readOpenClawConfig();
      expect(config).toBeUndefined();
    });

    it('should not strip commas inside strings', () => {
      const json5Content = `{
        "gateway": {
          "port": 19000,
          "note": "hello, world",
        },
      }`;
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 4400 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(json5Content);

      const config = readOpenClawConfig();
      expect((config?.gateway as any)?.note).toBe('hello, world');
    });

    it('should return undefined on parse error', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 5000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue('not valid json {{{');

      expect(readOpenClawConfig()).toBeUndefined();
    });

    it('should use cached config when mtime has not changed', () => {
      const configContent = JSON.stringify({
        gateway: { port: 19000 },
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 6000 } as fs.Stats);
      const readSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(configContent);

      // First call reads the file
      const config1 = readOpenClawConfig();
      expect(config1?.gateway?.port).toBe(19000);
      expect(readSpy).toHaveBeenCalledTimes(1);

      // Second call with same mtime should use cache
      const config2 = readOpenClawConfig();
      expect(config2?.gateway?.port).toBe(19000);
      expect(readSpy).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should re-read config when mtime changes', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSpy = vi.spyOn(fs, 'statSync');
      const readSpy = vi.spyOn(fs, 'readFileSync');

      // First call
      statSpy.mockReturnValue({ mtimeMs: 7000 } as fs.Stats);
      readSpy.mockReturnValue(JSON.stringify({ gateway: { port: 19000 } }));
      const config1 = readOpenClawConfig();
      expect(config1?.gateway?.port).toBe(19000);

      // Second call with different mtime
      statSpy.mockReturnValue({ mtimeMs: 8000 } as fs.Stats);
      readSpy.mockReturnValue(JSON.stringify({ gateway: { port: 20000 } }));
      const config2 = readOpenClawConfig();
      expect(config2?.gateway?.port).toBe(20000);
      expect(readSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('resolveGatewayUrl', () => {
    it('should use explicit config first', () => {
      expect(resolveGatewayUrl({ gateway_url: 'http://custom:9999' })).toBe('http://custom:9999');
    });

    it('should use environment variable second', () => {
      process.env.OPENCLAW_GATEWAY_URL = 'http://env-host:8888';
      expect(resolveGatewayUrl()).toBe('http://env-host:8888');
    });

    it('should fall back to legacy CLAWDBOT gateway URL environment variable', () => {
      process.env.CLAWDBOT_GATEWAY_URL = 'http://legacy-host:8888';
      expect(resolveGatewayUrl()).toBe('http://legacy-host:8888');
    });

    it('should auto-detect from config file third', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 9000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ gateway: { port: 20000 } }));

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:20000');
    });

    it('should treat 0.0.0.0 bind as 127.0.0.1', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, bind: '0.0.0.0' } }),
      );

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:20000');
    });

    it('should use specific non-wildcard bind address', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10500 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, bind: '192.168.1.5' } }),
      );

      expect(resolveGatewayUrl()).toBe('http://192.168.1.5:20000');
    });

    it('should treat lan bind mode as 127.0.0.1 for local autodetection', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10600 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, bind: 'lan' } }),
      );

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:20000');
    });

    it('should use customBindHost when bind mode is custom', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10700 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: { port: 20000, bind: 'custom', customBindHost: '192.168.1.8' },
        }),
      );

      expect(resolveGatewayUrl()).toBe('http://192.168.1.8:20000');
    });

    it('should treat loopback bind as 127.0.0.1', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 11000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, bind: 'loopback' } }),
      );

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:20000');
    });

    it('should treat :: (IPv6 wildcard) bind as 127.0.0.1', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10100 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, bind: '::' } }),
      );

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:20000');
    });

    it('should use default port when gateway section has no port', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10200 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ gateway: {} }));

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:18789');
    });

    it('should use OPENCLAW_GATEWAY_PORT for local auto-detection', () => {
      process.env.OPENCLAW_GATEWAY_PORT = '19999';
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10210 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({ gateway: { port: 20000 } }));

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:19999');
    });

    it('should use OPENCLAW_GATEWAY_PORT for default local URLs', () => {
      process.env.OPENCLAW_GATEWAY_PORT = '19999';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:19999');
    });

    it('should ignore malformed OPENCLAW_GATEWAY_PORT values', () => {
      process.env.OPENCLAW_GATEWAY_PORT = '19999x';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:18789');
    });

    it('should use https when local gateway TLS is enabled', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10250 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, tls: { enabled: true } } }),
      );

      expect(resolveGatewayUrl()).toBe('https://127.0.0.1:20000');
    });

    it('should use gateway.remote.url when config is in remote mode', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10260 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: { mode: 'remote', remote: { url: 'wss://remote.example:443' } },
        }),
      );

      expect(resolveGatewayUrl()).toBe('https://remote.example:443');
    });

    it('should prefer per-provider env override over process env', () => {
      process.env.OPENCLAW_GATEWAY_URL = 'http://process-env:8888';
      expect(resolveGatewayUrl(undefined, { OPENCLAW_GATEWAY_URL: 'http://override:7777' })).toBe(
        'http://override:7777',
      );
    });

    it('should fall back to default', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(resolveGatewayUrl()).toBe('http://127.0.0.1:18789');
    });

    it('should ignore whitespace-only explicit gateway URLs', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(resolveGatewayUrl({ gateway_url: '   ' })).toBe('http://127.0.0.1:18789');
    });
  });

  describe('resolveGatewayWsUrl', () => {
    it('should convert explicit http URLs to ws', () => {
      expect(resolveGatewayWsUrl({ gateway_url: 'http://host:1234' })).toBe('ws://host:1234');
    });

    it('should convert explicit https URLs to wss', () => {
      expect(resolveGatewayWsUrl({ gateway_url: 'https://host:1234' })).toBe('wss://host:1234');
    });

    it('should use wss when local gateway TLS is enabled', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10270 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({ gateway: { port: 20000, tls: { enabled: true } } }),
      );

      expect(resolveGatewayWsUrl()).toBe('wss://127.0.0.1:20000');
    });

    it('should preserve remote wss URLs in remote mode', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 10280 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: { mode: 'remote', remote: { url: 'wss://remote.example:443' } },
        }),
      );

      expect(resolveGatewayWsUrl()).toBe('wss://remote.example:443');
    });

    it('should use OPENCLAW_GATEWAY_PORT for default local websocket URLs', () => {
      process.env.OPENCLAW_GATEWAY_PORT = '19999';
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(resolveGatewayWsUrl()).toBe('ws://127.0.0.1:19999');
    });
  });

  describe('buildOpenClawModelName', () => {
    it('should build slash-style OpenClaw agent target model names', () => {
      expect(buildOpenClawModelName('main')).toBe('openclaw/main');
      expect(buildOpenClawModelName('default')).toBe('openclaw/default');
      expect(buildOpenClawModelName('openclaw:beta')).toBe('openclaw/beta');
      expect(buildOpenClawModelName('agent:beta')).toBe('openclaw/beta');
      expect(buildOpenClawModelName('openclaw/beta')).toBe('openclaw/beta');
      expect(buildOpenClawModelName('openclaw: beta ')).toBe('openclaw/beta');
      expect(buildOpenClawModelName('agent: beta ')).toBe('openclaw/beta');
      expect(buildOpenClawModelName('openclaw:')).toBe('openclaw/default');
      expect(buildOpenClawModelName('openclaw/')).toBe('openclaw/default');
      expect(buildOpenClawModelName('agent:')).toBe('openclaw/default');
    });
  });

  describe('resolveAuthToken', () => {
    it('should use explicit config first', () => {
      expect(resolveAuthToken({ auth_token: 'explicit-token' })).toBe('explicit-token');
    });

    it('should use environment variable second', () => {
      process.env.OPENCLAW_GATEWAY_TOKEN = 'env-token';
      expect(resolveAuthToken()).toBe('env-token');
    });

    it('should use password environment variable when token is unset', () => {
      process.env.OPENCLAW_GATEWAY_PASSWORD = 'env-password';
      expect(resolveAuthToken()).toBe('env-password');
    });

    it('should auto-detect from config file third', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 12000 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: { auth: { token: 'config-file-token' } },
        }),
      );

      expect(resolveAuthToken()).toBe('config-file-token');
    });

    it('should auto-detect password auth from config file', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 12100 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: { auth: { mode: 'password', password: 'config-file-password' } },
        }),
      );

      expect(resolveAuthToken()).toBe('config-file-password');
    });

    it('should fall back to gateway.remote token in local mode when gateway.auth is unset', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 12125 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: { mode: 'local', remote: { token: 'remote-config-token' } },
        }),
      );

      expect(resolveAuthToken()).toBe('remote-config-token');
    });

    it('should prefer the token from config file when mode is token and both secrets are set', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 12150 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: {
            auth: {
              mode: 'token',
              token: 'config-file-token',
              password: 'config-file-password',
            },
          },
        }),
      );

      expect(resolveAuthToken()).toBe('config-file-token');
    });

    it('should prefer gateway.remote password in remote mode when password auth is configured', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockReturnValue({ mtimeMs: 12175 } as fs.Stats);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(
        JSON.stringify({
          gateway: {
            mode: 'remote',
            auth: { mode: 'password', password: 'local-config-password' },
            remote: { password: 'remote-config-password' },
          },
        }),
      );

      expect(resolveAuthToken()).toBe('remote-config-password');
    });

    it('should prefer per-provider env override over process env', () => {
      process.env.OPENCLAW_GATEWAY_TOKEN = 'process-token';
      expect(resolveAuthToken(undefined, { OPENCLAW_GATEWAY_TOKEN: 'override-token' })).toBe(
        'override-token',
      );
    });

    it('should use explicit auth password when provided', () => {
      expect(resolveAuthToken({ auth_password: 'explicit-password' })).toBe('explicit-password');
    });

    it('should fall back to legacy CLAWDBOT token environment variables', () => {
      process.env.CLAWDBOT_GATEWAY_TOKEN = 'legacy-token';
      expect(resolveAuthToken()).toBe('legacy-token');
    });

    it('should return undefined when no token available', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(resolveAuthToken()).toBeUndefined();
    });
  });

  describe('OpenClawChatProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should initialize with correct agent ID', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.id()).toBe('openclaw:main');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawChatProvider('coding-agent', {});
      expect(provider.toString()).toBe('[OpenClaw Provider coding-agent]');
    });

    it('should return correct default API URL', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.getApiUrlDefault()).toBe('http://127.0.0.1:18789/v1');
    });

    it('should use explicit gateway URL from config', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { gateway_url: 'http://myhost:9999' },
      });
      expect(provider.config.apiBaseUrl).toBe('http://myhost:9999/v1');
    });

    it('should use auth token from config', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { auth_token: 'my-secret-token' },
      });
      expect(provider.config.apiKey).toBe('my-secret-token');
    });

    it('should set agent ID header', () => {
      const provider = new OpenClawChatProvider('coding-agent', {});
      expect(provider.config.headers?.['x-openclaw-agent-id']).toBe('coding-agent');
    });

    it('should use OpenClaw slash-style model names', () => {
      const provider = new OpenClawChatProvider('coding-agent', {});
      expect(provider.modelName).toBe('openclaw/coding-agent');
    });

    it('should set session key header when provided', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { session_key: 'my-session' },
      });
      expect(provider.config.headers?.['x-openclaw-session-key']).toBe('my-session');
    });

    it('should not set session key header when not provided', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.config.headers?.['x-openclaw-session-key']).toBeUndefined();
    });

    it('should not set thinking level header (only supported by WS agent)', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { thinking_level: 'high' },
      });
      expect(provider.config.headers?.['x-openclaw-thinking-level']).toBeUndefined();
    });

    it('should not fall back to OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-key';
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.getApiKey()).toBeUndefined();
    });

    it('should not fall back to OPENAI_BASE_URL', () => {
      process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.getApiUrl()).toBe('http://127.0.0.1:18789/v1');
    });

    it('should set apiKeyRequired to false', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.config.apiKeyRequired).toBe(false);
    });

    it('should not set apiKey when no auth token resolved', () => {
      const provider = new OpenClawChatProvider('main', {});
      expect(provider.config.apiKey).toBeUndefined();
    });

    it('should merge custom headers with openclaw headers', () => {
      const provider = new OpenClawChatProvider('main', {
        config: { headers: { 'x-custom': 'value' } },
      });
      expect(provider.config.headers?.['x-custom']).toBe('value');
      expect(provider.config.headers?.['x-openclaw-agent-id']).toBe('main');
    });

    it('should set OpenClaw context headers from typed config', () => {
      const provider = new OpenClawChatProvider('main', {
        config: {
          backend_model: 'openai/gpt-5.4',
          message_channel: 'slack',
          account_id: 'work',
          scopes: ['operator.read', 'operator.write'],
        },
      });

      expect(provider.config.headers?.['x-openclaw-model']).toBe('openai/gpt-5.4');
      expect(provider.config.headers?.['x-openclaw-message-channel']).toBe('slack');
      expect(provider.config.headers?.['x-openclaw-account-id']).toBe('work');
      expect(provider.config.headers?.['x-openclaw-scopes']).toBe('operator.read,operator.write');
    });

    it('should prefer typed OpenClaw context config over custom header values', () => {
      const provider = new OpenClawChatProvider('main', {
        config: {
          backend_model: 'openai/gpt-5.4',
          headers: { 'x-openclaw-model': 'stale-model' },
        },
      });

      expect(provider.config.headers?.['x-openclaw-model']).toBe('openai/gpt-5.4');
    });
  });

  describe('OpenClawResponsesProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should initialize with correct agent ID', () => {
      const provider = new OpenClawResponsesProvider('main', {});
      expect(provider.id()).toBe('openclaw:responses:main');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawResponsesProvider('coding-agent', {});
      expect(provider.toString()).toBe('[OpenClaw Responses Provider coding-agent]');
    });

    it('should use explicit gateway URL from config', () => {
      const provider = new OpenClawResponsesProvider('main', {
        config: { gateway_url: 'http://myhost:9999' },
      });
      expect(provider.config.apiBaseUrl).toBe('http://myhost:9999/v1');
    });

    it('should use auth token from config', () => {
      const provider = new OpenClawResponsesProvider('main', {
        config: { auth_token: 'my-secret-token' },
      });
      expect(provider.config.apiKey).toBe('my-secret-token');
    });

    it('should set agent ID header', () => {
      const provider = new OpenClawResponsesProvider('beta', {});
      expect(provider.config.headers?.['x-openclaw-agent-id']).toBe('beta');
    });

    it('should set session key header but not thinking level', () => {
      const provider = new OpenClawResponsesProvider('main', {
        config: { session_key: 'my-session', thinking_level: 'high' },
      });
      expect(provider.config.headers?.['x-openclaw-session-key']).toBe('my-session');
      expect(provider.config.headers?.['x-openclaw-thinking-level']).toBeUndefined();
    });

    it('should strip text field from request body in getOpenAiBody', async () => {
      const provider = new OpenClawResponsesProvider('main', {});
      const result = await provider.getOpenAiBody('test prompt');
      expect(result.body).not.toHaveProperty('text');
    });

    it('should return correct default API URL', () => {
      const provider = new OpenClawResponsesProvider('main', {});
      expect(provider.getApiUrlDefault()).toBe('http://127.0.0.1:18789/v1');
    });

    it('should not fall back to OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-key';
      const provider = new OpenClawResponsesProvider('main', {});
      expect(provider.getApiKey()).toBeUndefined();
    });

    it('should not fall back to OPENAI_BASE_URL', () => {
      process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
      const provider = new OpenClawResponsesProvider('main', {});
      expect(provider.getApiUrl()).toBe('http://127.0.0.1:18789/v1');
    });

    it('should set apiKeyRequired to false', () => {
      const provider = new OpenClawResponsesProvider('main', {});
      expect(provider.config.apiKeyRequired).toBe(false);
    });

    it('should call the responses endpoint without requiring an OpenAI API key', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: 'OpenClaw response' }],
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const provider = new OpenClawResponsesProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const result = await provider.callApi('test prompt');

      expect(result.output).toBe('OpenClaw response');
      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(mockFetchWithCache.mock.calls[0][0]).toBe('http://test:18789/v1/responses');
      expect(mockFetchWithCache.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });
  });

  describe('OpenClawEmbeddingProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should initialize with correct agent ID', () => {
      const provider = new OpenClawEmbeddingProvider('main', {});
      expect(provider.id()).toBe('openclaw:embedding:main');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawEmbeddingProvider('coding-agent', {});
      expect(provider.toString()).toBe('[OpenClaw Embedding Provider coding-agent]');
    });

    it('should use explicit gateway URL from config', () => {
      const provider = new OpenClawEmbeddingProvider('main', {
        config: { gateway_url: 'http://myhost:9999' },
      });
      expect(provider.config.apiBaseUrl).toBe('http://myhost:9999/v1');
    });

    it('should not fall back to OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-key';
      const provider = new OpenClawEmbeddingProvider('main', {});
      expect(provider.getApiKey()).toBeUndefined();
    });

    it('should call the embeddings endpoint without requiring an OpenAI API key', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          data: [{ embedding: [0.1, 0.2, 0.3] }],
          usage: { total_tokens: 3, prompt_tokens: 3 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const provider = new OpenClawEmbeddingProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const result = await provider.callEmbeddingApi('embed this');

      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(mockFetchWithCache.mock.calls[0][0]).toBe('http://test:18789/v1/embeddings');
      expect(mockFetchWithCache.mock.calls[0][1].headers.Authorization).toBeUndefined();
      expect(JSON.parse(mockFetchWithCache.mock.calls[0][1].body).model).toBe('openclaw/main');
    });

    it('should send backend embedding model override as an OpenClaw header', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: { data: [{ embedding: [1] }] },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const provider = new OpenClawEmbeddingProvider('main', {
        config: {
          backend_model: 'openai/text-embedding-3-small',
          gateway_url: 'http://test:18789',
        },
      });

      await provider.callEmbeddingApi('embed this');

      expect(mockFetchWithCache.mock.calls[0][1].headers['x-openclaw-model']).toBe(
        'openai/text-embedding-3-small',
      );
    });
  });

  describe('OpenClawToolInvokeProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should initialize with correct tool name', () => {
      const provider = new OpenClawToolInvokeProvider('bash', {});
      expect(provider.id()).toBe('openclaw:tools:bash');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawToolInvokeProvider('agents_list', {});
      expect(provider.toString()).toBe('[OpenClaw Tool Provider agents_list]');
    });

    it('should handle successful tool invocation', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      const mockResponse = { ok: true, result: 'command output' };
      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.callApi('{"command": "echo hello"}');
      expect(result.output).toBe('command output');
    });

    it('should handle JSON args from prompt', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{"key": "value"}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.tool).toBe('bash');
      expect(body.args).toEqual({ key: 'value' });
    });

    it('should fall back to input arg for non-JSON prompts', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('echo hello');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.args).toEqual({ input: 'echo hello' });
    });

    it('should handle tool errors', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: 'command not found' }),
      } as Response);

      const result = await provider.callApi('{"command": "bad"}');
      expect(result.error).toBe('command not found');
    });

    it('should handle structured OpenClaw tool errors', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false, error: { type: 'forbidden', message: 'not allowed' } }),
      } as Response);

      const result = await provider.callApi('{"command": "bad"}');
      expect(result.error).toBe('not allowed');
    });

    it('should handle HTTP errors', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      } as Response);

      const result = await provider.callApi('{}');
      expect(result.error).toContain('404');
    });

    it('should include auth token in request', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789', auth_token: 'my-token' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('should include session key when configured', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789', session_key: 'my-session' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.sessionKey).toBe('my-session');
    });

    it('should include action and dryRun when configured', async () => {
      const provider = new OpenClawToolInvokeProvider('sessions_list', {
        config: { action: 'json', dry_run: true, gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.action).toBe('json');
      expect(body.dryRun).toBe(true);
    });

    it('should merge custom headers into the request', async () => {
      const provider = new OpenClawToolInvokeProvider('sessions_list', {
        config: {
          gateway_url: 'http://test:18789',
          headers: { 'x-openclaw-message-channel': 'slack' },
        },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['x-openclaw-message-channel']).toBe('slack');
    });

    it('should include typed OpenClaw context headers in tool invoke requests', async () => {
      const provider = new OpenClawToolInvokeProvider('sessions_list', {
        config: {
          account_id: 'work',
          gateway_url: 'http://test:18789',
          message_channel: 'slack',
        },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['x-openclaw-message-channel']).toBe('slack');
      expect(headers['x-openclaw-account-id']).toBe('work');
    });

    it('should stringify non-string results', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { key: 'value' } }),
      } as Response);

      const result = await provider.callApi('{}');
      expect(result.output).toBe('{"key":"value"}');
    });

    it('should handle network errors', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await provider.callApi('{}');
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('should return correct toJSON representation', () => {
      const provider = new OpenClawToolInvokeProvider('bash', {});
      expect(provider.toJSON()).toEqual({ provider: 'openclaw:tools:bash' });
    });

    it('should not include Authorization header when no auth token', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should not include sessionKey when not configured', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: 'ok' }),
      } as Response);

      await provider.callApi('{}');

      const fetchCall = mockFetchWithProxy.mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.sessionKey).toBeUndefined();
    });

    it('should handle tool error with no error message', async () => {
      const provider = new OpenClawToolInvokeProvider('bash', {
        config: { gateway_url: 'http://test:18789' },
      });

      mockFetchWithProxy.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: false }),
      } as Response);

      const result = await provider.callApi('{}');
      expect(result.error).toBe('Unknown tool error');
    });
  });

  describe('OpenClawAgentProvider', () => {
    let mockWs: any;
    let messageHandlers: Map<string, Function>;

    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      messageHandlers = new Map();
      mockWs = {
        on: vi.fn((event: string, handler: Function) => {
          messageHandlers.set(event, handler);
        }),
        send: vi.fn(),
        close: vi.fn(),
      };
      websocketMocks.WebSocketMock.mockClear();
      websocketMocks.setFactory(() => mockWs);
    });

    it('should initialize with correct agent ID', () => {
      const provider = new OpenClawAgentProvider('main', {});
      expect(provider.id()).toBe('openclaw:agent:main');
    });

    it('should return correct string representation', () => {
      const provider = new OpenClawAgentProvider('my-agent', {});
      expect(provider.toString()).toBe('[OpenClaw Agent Provider my-agent]');
    });

    /** Helper: simulate challenge → connect → agent accepted flow, return agent req ID */
    function simulateHandshake(
      onMessage: Function,
      connectPayload: Record<string, unknown> = { type: 'hello-ok' },
    ) {
      // Challenge
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'abc', ts: Date.now() },
          }),
        ),
      );

      // Connect response
      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: connectReq.id,
            ok: true,
            payload: connectPayload,
          }),
        ),
      );

      const agentReq = JSON.parse(mockWs.send.mock.calls[1][0]);

      // Agent accepted → triggers agent.wait
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: agentReq.id,
            ok: true,
            payload: { runId: 'run-1', status: 'accepted' },
          }),
        ),
      );

      const waitReq = JSON.parse(mockWs.send.mock.calls[2][0]);
      return { connectReq, agentReq, waitReq };
    }

    it('should complete full handshake and receive response', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789', auth_token: 'test-token' },
      });

      const promise = provider.callApi('Hello agent');
      const onMessage = messageHandlers.get('message')!;
      const { connectReq, agentReq, waitReq } = simulateHandshake(onMessage);

      // Verify connect request
      expect(connectReq.type).toBe('req');
      expect(connectReq.method).toBe('connect');
      expect(connectReq.params.auth.token).toBe('test-token');
      expect(connectReq.params.device).toEqual({
        id: 'device-1',
        publicKey: 'public-key',
        signature: 'signature:abc:test-token',
        signedAt: 1234,
        nonce: 'abc',
      });
      expect(deviceAuthMocks.buildSignedOpenClawDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'gateway-client',
          clientMode: 'cli',
          nonce: 'abc',
          platform: process.platform,
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          token: 'test-token',
        }),
      );

      // Verify agent request
      expect(agentReq.method).toBe('agent');
      expect(agentReq.params.message).toBe('Hello agent');
      expect(agentReq.params.agentId).toBe('main');
      expect(agentReq.params.sessionKey).toMatch(/^promptfoo-[0-9a-f-]{36}$/);

      // Verify wait request
      expect(waitReq.method).toBe('agent.wait');
      expect(waitReq.params.runId).toBe('run-1');

      // Streaming event with assistant text
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Agent reply' },
              seq: 1,
              ts: Date.now(),
            },
          }),
        ),
      );

      // Wait response signals completion
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { runId: 'run-1', status: 'ok' },
          }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Agent reply');
    });

    it('should use last text from streaming events', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Streaming events — text is accumulated (full text so far), not incremental
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Hello ' },
              seq: 1,
              ts: 1,
            },
          }),
        ),
      );
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Hello world!' },
              seq: 2,
              ts: 2,
            },
          }),
        ),
      );

      // Wait response
      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Hello world!');
    });

    it('should accumulate assistant delta streaming events', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { delta: 'Hello' },
              seq: 1,
              ts: 1,
            },
          }),
        ),
      );
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { delta: ' world!' },
              seq: 2,
              ts: 2,
            },
          }),
        ),
      );

      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Hello world!');
    });

    it('should persist issued device tokens from hello-ok', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789', device_auth_path: '/tmp/device-auth.json' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage, {
        type: 'hello-ok',
        auth: {
          deviceToken: 'issued-device-token',
          role: 'operator',
          scopes: ['operator.read'],
        },
      });

      expect(deviceAuthMocks.storeOpenClawDeviceAuthToken).toHaveBeenCalledWith({
        deviceId: 'device-1',
        role: 'operator',
        token: 'issued-device-token',
        scopes: ['operator.read'],
        filePath: '/tmp/device-auth.json',
      });

      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      await promise;
    });

    it('should ignore streaming events from other runIds', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Event from a different run should be ignored
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'other-run',
              stream: 'assistant',
              data: { text: 'Wrong answer' },
              seq: 1,
              ts: 1,
            },
          }),
        ),
      );

      // Event from the correct run
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Correct answer' },
              seq: 1,
              ts: 1,
            },
          }),
        ),
      );

      // Wait response
      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Correct answer');
    });

    it('should handle connect failure', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      // Challenge
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );

      // Connect error
      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: connectReq.id,
            ok: false,
            error: { code: 'AUTH_FAILED', message: 'Invalid token' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('Invalid token');
    });

    it('should handle agent error response', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      // Challenge → connect
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );
      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(JSON.stringify({ type: 'res', id: connectReq.id, ok: true, payload: {} })),
      );
      const agentReq = JSON.parse(mockWs.send.mock.calls[1][0]);

      // Agent rejection
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: agentReq.id,
            ok: false,
            error: { code: 'AGENT_TIMEOUT', message: 'Agent timed out' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('Agent timed out');
    });

    it('should fail immediately when agent acceptance is missing a runId', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );
      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(JSON.stringify({ type: 'res', id: connectReq.id, ok: true, payload: {} })),
      );
      const agentReq = JSON.parse(mockWs.send.mock.calls[1][0]);

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: agentReq.id,
            ok: true,
            payload: { status: 'accepted' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('without a runId');
      expect(mockWs.send).toHaveBeenCalledTimes(2);
    });

    it('should handle WebSocket errors', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onError = messageHandlers.get('error')!;
      onError(new Error('Connection refused'));

      const result = await promise;
      expect(result.error).toContain('Connection refused');
    });

    it('should handle timeout', async () => {
      vi.useFakeTimers();

      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789', timeoutMs: 5000 },
      });

      const promise = provider.callApi('Hello');

      // Advance past timeout
      vi.advanceTimersByTime(6000);

      const result = await promise;
      expect(result.error).toContain('timed out');

      vi.useRealTimers();
    });

    it('should include session key and thinking level when configured', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: {
          gateway_url: 'http://test:18789',
          session_key: 'my-session',
          thinking_level: 'high',
        },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { agentReq, waitReq } = simulateHandshake(onMessage);

      expect(agentReq.params.sessionKey).toBe('my-session');
      expect(agentReq.params.thinking).toBe('high');

      // Wait response to resolve
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { status: 'ok' },
          }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('No output from agent');
    });

    it('should scope generated session keys for non-main agents', async () => {
      const provider = new OpenClawAgentProvider('dev', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { agentReq, waitReq } = simulateHandshake(onMessage);

      expect(agentReq.params.agentId).toBe('dev');
      expect(agentReq.params.sessionKey).toMatch(/^agent:dev:promptfoo-[0-9a-f-]{36}$/);

      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      await promise;
    });

    it('should scope unscoped configured session keys for non-main agents', async () => {
      const provider = new OpenClawAgentProvider('dev', {
        config: { gateway_url: 'http://test:18789', session_key: 'my-session' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { agentReq, waitReq } = simulateHandshake(onMessage);

      expect(agentReq.params.agentId).toBe('dev');
      expect(agentReq.params.sessionKey).toBe('agent:dev:my-session');

      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      await promise;
    });

    it('should include channel and account context when configured', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: {
          gateway_url: 'http://test:18789',
          message_channel: 'slack',
          account_id: 'work',
        },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { agentReq, waitReq } = simulateHandshake(onMessage);

      expect(agentReq.params.channel).toBe('slack');
      expect(agentReq.params.accountId).toBe('work');

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { status: 'ok' },
          }),
        ),
      );

      await promise;
    });

    it('should include device family in both client metadata and the signed payload', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: {
          gateway_url: 'http://test:18789',
          auth_token: 'test-token',
          device_family: 'promptfoo-e2e',
        },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { connectReq, waitReq } = simulateHandshake(onMessage);

      expect(connectReq.params.client.deviceFamily).toBe('promptfoo-e2e');
      expect(deviceAuthMocks.buildSignedOpenClawDevice).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceFamily: 'promptfoo-e2e',
          token: 'test-token',
        }),
      );

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { status: 'ok' },
          }),
        ),
      );

      await promise;
    });

    it('should send password auth during connect when auth_password is configured', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789', auth_password: 'my-password' },
      });

      void provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );

      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(connectReq.params.auth.password).toBe('my-password');
      expect(connectReq.params.auth.token).toBeUndefined();
      expect(connectReq.params.device.signature).toBe('signature:n:');
      expect(deviceAuthMocks.buildSignedOpenClawDevice).toHaveBeenCalledWith(
        expect.objectContaining({ token: null }),
      );
    });

    it('should omit device identity when disabled explicitly', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { disable_device_auth: true, gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );

      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(connectReq.params.device).toBeUndefined();
      expect(deviceAuthMocks.loadOrCreateOpenClawDeviceIdentity).not.toHaveBeenCalled();

      const onError = messageHandlers.get('error')!;
      onError(new Error('test cleanup'));
      await promise;
    });

    it('should pass custom websocket headers', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: {
          gateway_url: 'http://test:18789',
          headers: { 'x-trusted-user': 'alice' },
          ws_headers: { 'x-openclaw-account-id': 'work' },
        },
      });

      const promise = provider.callApi('Hello');

      const wsConstructorCall = websocketMocks.WebSocketMock.mock.calls[0];
      expect(wsConstructorCall[1].headers).toEqual({
        'x-trusted-user': 'alice',
        'x-openclaw-account-id': 'work',
      });

      const onError = messageHandlers.get('error')!;
      onError(new Error('test cleanup'));
      await promise;
    });

    it('should include extraSystemPrompt when configured', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: {
          extra_system_prompt: 'Be terse.',
          gateway_url: 'http://test:18789',
        },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { agentReq, waitReq } = simulateHandshake(onMessage);

      expect(agentReq.params.extraSystemPrompt).toBe('Be terse.');

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { status: 'ok' },
          }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('No output from agent');
    });

    it('should handle agent.wait error response', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Wait response with error
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: false,
            error: { code: 'AGENT_CRASH', message: 'Agent crashed during execution' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('Agent crashed during execution');
    });

    it('should surface terminal agent.wait error payloads', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { status: 'error', error: 'LLM request failed: network connection error.' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('LLM request failed');
    });

    it('should surface terminal agent.wait timeout payloads', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: waitReq.id,
            ok: true,
            payload: { status: 'timeout' },
          }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('timed out waiting for run run-1');
    });

    it('should surface lifecycle error events when wait returns without output', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'lifecycle',
              data: { phase: 'error', error: 'LLM request failed: network connection error.' },
            },
          }),
        ),
      );
      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.error).toContain('LLM request failed');
    });

    it('should prefer recovered assistant output over earlier lifecycle errors', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'lifecycle',
              data: { phase: 'error', error: 'transient model error' },
            },
          }),
        ),
      );
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: {
              runId: 'run-1',
              stream: 'assistant',
              data: { text: 'Recovered answer' },
            },
          }),
        ),
      );
      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Recovered answer');
    });

    it('should resolve with error on unexpected WS close', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onClose = messageHandlers.get('close')!;

      // Server closes connection unexpectedly
      onClose();

      const result = await promise;
      expect(result.error).toContain('closed unexpectedly');
    });

    it('should cleanup WS connection', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      // Start a call to create a WS
      provider.callApi('Hello');
      await provider.cleanup();
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should return correct toJSON representation', () => {
      const provider = new OpenClawAgentProvider('main', {});
      expect(provider.toJSON()).toEqual({ provider: 'openclaw:agent:main' });
    });

    it('should convert https to wss for WebSocket URL', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'https://secure-host:18789' },
      });

      provider.callApi('Hello');
      const wsConstructorCall = websocketMocks.WebSocketMock.mock.calls[0];
      expect(wsConstructorCall[0]).toBe('wss://secure-host:18789');
    });

    it('should not include auth field when no token configured', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      // Challenge
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'abc', ts: Date.now() },
          }),
        ),
      );

      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(connectReq.params.auth).toBeUndefined();
      expect(connectReq.params.device.signature).toBe('signature:abc:');

      // Clean up: error to resolve the promise
      const onError = messageHandlers.get('error')!;
      onError(new Error('test cleanup'));
      await promise;
    });

    it('should reconnect with a cached device token on auth token mismatch', async () => {
      const wsInstances: Array<{ handlers: Map<string, Function>; send: any; close: any }> = [];
      websocketMocks.setFactory(() => {
        const handlers = new Map<string, Function>();
        const ws = {
          handlers,
          on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
          send: vi.fn(),
          close: vi.fn(),
        };
        wsInstances.push(ws);
        return ws;
      });
      deviceAuthMocks.loadOpenClawDeviceAuthToken.mockReturnValue({
        token: 'cached-device-token',
        role: 'operator',
        scopes: ['operator.read'],
        updatedAtMs: 1,
      });

      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789', auth_token: 'bad-token' },
      });

      const promise = provider.callApi('Hello');
      const firstOnMessage = wsInstances[0].handlers.get('message')!;
      firstOnMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'first', ts: 1 },
          }),
        ),
      );
      const firstConnectReq = JSON.parse(wsInstances[0].send.mock.calls[0][0]);
      expect(firstConnectReq.params.auth.token).toBe('bad-token');

      firstOnMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: firstConnectReq.id,
            ok: false,
            error: {
              code: 'AUTH_UNAUTHORIZED',
              message: 'Invalid token',
              details: {
                code: 'AUTH_TOKEN_MISMATCH',
                canRetryWithDeviceToken: true,
                recommendedNextStep: 'retry_with_device_token',
              },
            },
          }),
        ),
      );

      await vi.waitFor(
        () => {
          expect(wsInstances).toHaveLength(2);
        },
        { timeout: 1000 },
      );

      const secondOnMessage = wsInstances[1].handlers.get('message')!;
      secondOnMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'second', ts: 2 },
          }),
        ),
      );
      const secondConnectReq = JSON.parse(wsInstances[1].send.mock.calls[0][0]);
      expect(secondConnectReq.params.auth.deviceToken).toBe('cached-device-token');
      expect(secondConnectReq.params.scopes).toEqual(['operator.read']);
      expect(secondConnectReq.params.device.signature).toBe('signature:second:cached-device-token');

      secondOnMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: secondConnectReq.id, ok: true, payload: {} }),
        ),
      );
      const agentReq = JSON.parse(wsInstances[1].send.mock.calls[1][0]);
      secondOnMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: agentReq.id,
            ok: true,
            payload: { runId: 'run-1', status: 'accepted' },
          }),
        ),
      );
      const waitReq = JSON.parse(wsInstances[1].send.mock.calls[2][0]);
      secondOnMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: { runId: 'run-1', stream: 'assistant', data: { text: 'retried' } },
          }),
        ),
      );
      secondOnMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('retried');
    });

    it('should ignore malformed JSON frames', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      // Send malformed JSON — should be silently ignored
      onMessage(Buffer.from('not valid json {{{'));

      // Now do the normal handshake
      const { waitReq } = simulateHandshake(onMessage);

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: { runId: 'run-1', stream: 'assistant', data: { text: 'OK' } },
          }),
        ),
      );

      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('OK');
    });

    it('should ignore non-assistant stream events', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Non-assistant stream events should be ignored
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: { runId: 'run-1', stream: 'tool', data: { text: 'tool output' } },
          }),
        ),
      );

      // Only assistant stream produces output
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'agent',
            payload: { runId: 'run-1', stream: 'assistant', data: { text: 'Agent says hi' } },
          }),
        ),
      );

      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('Agent says hi');
    });

    it('should return default message when no streaming output received', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;
      const { waitReq } = simulateHandshake(onMessage);

      // Wait response with no streaming events
      onMessage(
        Buffer.from(
          JSON.stringify({ type: 'res', id: waitReq.id, ok: true, payload: { status: 'ok' } }),
        ),
      );

      const result = await promise;
      expect(result.output).toBe('No output from agent');
    });

    /** Helper: simulate challenge → connect mismatch error, return the resolved promise */
    async function simulateDeviceTokenMismatch(provider: OpenClawAgentProvider) {
      const promise = provider.callApi('Hello');
      const onMessage = messageHandlers.get('message')!;

      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'event',
            event: 'connect.challenge',
            payload: { nonce: 'n', ts: 1 },
          }),
        ),
      );

      const connectReq = JSON.parse(mockWs.send.mock.calls[0][0]);
      onMessage(
        Buffer.from(
          JSON.stringify({
            type: 'res',
            id: connectReq.id,
            ok: false,
            error: {
              code: 'AUTH_DEVICE_TOKEN_MISMATCH',
              message: 'Device token mismatch',
            },
          }),
        ),
      );

      return promise;
    }

    it('should clear stored device token on AUTH_DEVICE_TOKEN_MISMATCH', async () => {
      deviceAuthMocks.loadOpenClawDeviceAuthToken.mockReturnValue({
        token: 'stale-token',
        role: 'operator',
        scopes: ['operator.read'],
        updatedAtMs: 1,
      });

      const provider = new OpenClawAgentProvider('main', {
        config: { gateway_url: 'http://test:18789' },
      });

      await simulateDeviceTokenMismatch(provider);
      expect(deviceAuthMocks.clearOpenClawDeviceAuthToken).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'device-1', role: 'operator' }),
      );
    });

    it('should not clear config-provided device token on mismatch', async () => {
      const provider = new OpenClawAgentProvider('main', {
        config: {
          gateway_url: 'http://test:18789',
          device_token: 'config-device-token',
        },
      });

      await simulateDeviceTokenMismatch(provider);
      expect(deviceAuthMocks.clearOpenClawDeviceAuthToken).not.toHaveBeenCalled();
    });
  });

  describe('createOpenClawProvider', () => {
    beforeEach(() => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    it('should create chat provider for openclaw:main', () => {
      const provider = createOpenClawProvider('openclaw:main');
      expect(provider).toBeInstanceOf(OpenClawChatProvider);
      expect(provider.id()).toBe('openclaw:main');
    });

    it('should default to main agent when no agent specified', () => {
      const provider = createOpenClawProvider('openclaw');
      expect(provider).toBeInstanceOf(OpenClawChatProvider);
      expect(provider.id()).toBe('openclaw:main');
    });

    it('should support custom agent IDs for chat', () => {
      const provider = createOpenClawProvider('openclaw:my-custom-agent');
      expect(provider).toBeInstanceOf(OpenClawChatProvider);
      expect(provider.id()).toBe('openclaw:my-custom-agent');
    });

    it('should create responses provider for openclaw:responses', () => {
      const provider = createOpenClawProvider('openclaw:responses');
      expect(provider).toBeInstanceOf(OpenClawResponsesProvider);
      expect(provider.id()).toBe('openclaw:responses:main');
    });

    it('should create responses provider with agent ID', () => {
      const provider = createOpenClawProvider('openclaw:responses:beta');
      expect(provider).toBeInstanceOf(OpenClawResponsesProvider);
      expect(provider.id()).toBe('openclaw:responses:beta');
    });

    it('should create embedding provider for openclaw:embedding', () => {
      const provider = createOpenClawProvider('openclaw:embedding');
      expect(provider).toBeInstanceOf(OpenClawEmbeddingProvider);
      expect(provider.id()).toBe('openclaw:embedding:main');
    });

    it('should create embedding provider with agent ID and plural alias', () => {
      const provider = createOpenClawProvider('openclaw:embeddings:beta');
      expect(provider).toBeInstanceOf(OpenClawEmbeddingProvider);
      expect(provider.id()).toBe('openclaw:embedding:beta');
    });

    it('should create agent provider for openclaw:agent', () => {
      const provider = createOpenClawProvider('openclaw:agent');
      expect(provider).toBeInstanceOf(OpenClawAgentProvider);
      expect(provider.id()).toBe('openclaw:agent:main');
    });

    it('should create agent provider with agent ID', () => {
      const provider = createOpenClawProvider('openclaw:agent:my-agent');
      expect(provider).toBeInstanceOf(OpenClawAgentProvider);
      expect(provider.id()).toBe('openclaw:agent:my-agent');
    });

    it('should create tool provider for openclaw:tools:bash', () => {
      const provider = createOpenClawProvider('openclaw:tools:bash');
      expect(provider).toBeInstanceOf(OpenClawToolInvokeProvider);
      expect(provider.id()).toBe('openclaw:tools:bash');
    });

    it('should throw for openclaw:tools without tool name', () => {
      expect(() => createOpenClawProvider('openclaw:tools')).toThrow(
        'OpenClaw tools provider requires a tool name',
      );
    });

    it('should pass config options through', () => {
      const provider = createOpenClawProvider('openclaw:main', {
        config: {
          gateway_url: 'http://test:1234',
          auth_token: 'test-token',
        },
      }) as OpenClawChatProvider;
      expect(provider.config.apiBaseUrl).toBe('http://test:1234/v1');
      expect(provider.config.apiKey).toBe('test-token');
    });

    it('should pass env overrides through', () => {
      const provider = createOpenClawProvider(
        'openclaw:main',
        {},
        { OPENCLAW_GATEWAY_TOKEN: 'env-override' },
      ) as OpenClawChatProvider;
      expect(provider.env?.OPENCLAW_GATEWAY_TOKEN).toBe('env-override');
    });

    it('should handle tool name with colons', () => {
      const provider = createOpenClawProvider('openclaw:tools:ns:tool');
      expect(provider).toBeInstanceOf(OpenClawToolInvokeProvider);
      expect(provider.id()).toBe('openclaw:tools:ns:tool');
    });

    it('should create chat provider for agent ID with hyphens', () => {
      const provider = createOpenClawProvider('openclaw:my-custom-agent-v2');
      expect(provider).toBeInstanceOf(OpenClawChatProvider);
      expect(provider.id()).toBe('openclaw:my-custom-agent-v2');
    });
  });

  describe('resetConfigCache', () => {
    it('should clear cached config forcing re-read', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const statSpy = vi.spyOn(fs, 'statSync');
      const readSpy = vi.spyOn(fs, 'readFileSync');

      // First read
      statSpy.mockReturnValue({ mtimeMs: 50000 } as fs.Stats);
      readSpy.mockReturnValue(JSON.stringify({ gateway: { port: 19000 } }));
      const config1 = readOpenClawConfig();
      expect(config1?.gateway?.port).toBe(19000);
      expect(readSpy).toHaveBeenCalledTimes(1);

      // Second read with same mtime — uses cache
      const config2 = readOpenClawConfig();
      expect(config2?.gateway?.port).toBe(19000);
      expect(readSpy).toHaveBeenCalledTimes(1);

      // Reset cache
      resetConfigCache();

      // Third read with same mtime — forced to re-read
      readSpy.mockReturnValue(JSON.stringify({ gateway: { port: 20000 } }));
      const config3 = readOpenClawConfig();
      expect(config3?.gateway?.port).toBe(20000);
      expect(readSpy).toHaveBeenCalledTimes(2);
    });
  });
});
