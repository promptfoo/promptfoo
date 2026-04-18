import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { AnthropicGenericProvider } from '../../../src/providers/anthropic/generic';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';
import { mockProcessEnv } from '../../util/utils';

const claudeCodeAuthMocks = vi.hoisted(() => ({
  loadClaudeCodeCredential: vi.fn(),
  isCredentialExpired: vi.fn(),
}));

vi.mock('../../../src/providers/anthropic/claudeCodeAuth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    loadClaudeCodeCredential: claudeCodeAuthMocks.loadClaudeCodeCredential,
    isCredentialExpired: claudeCodeAuthMocks.isCredentialExpired,
  };
});

vi.mock('proxy-agent', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    ProxyAgent: vi.fn().mockImplementation(function () {
      return {};
    }),
  };
});

describe('AnthropicGenericProvider', () => {
  describe('constructor', () => {
    it('should initialize with the given model name', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.modelName).toBe('claude-3-5-sonnet-20241022');
      expect(provider.config).toEqual({});
    });

    it('should use custom configuration if provided', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://custom.anthropic.api',
          headers: { 'Custom-Header': 'Value' },
        },
      });

      expect(provider.config.apiKey).toBe('test-key');
      expect(provider.config.apiBaseUrl).toBe('https://custom.anthropic.api');
      expect(provider.config.headers).toEqual({ 'Custom-Header': 'Value' });
    });

    it('should set a custom ID if provided', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        id: 'custom-id',
      });

      expect(provider.id()).toBe('custom-id');
    });
  });

  describe('id', () => {
    it('should return the formatted ID', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.id()).toBe('anthropic:claude-3-5-sonnet-20241022');
    });
  });

  describe('toString', () => {
    it('should return a formatted string representation', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.toString()).toBe('[Anthropic Provider claude-3-5-sonnet-20241022]');
    });
  });

  describe('getApiKey', () => {
    it('should return the API key from config', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.getApiKey()).toBe('test-key');
    });

    it('should use environment variables if no config key is provided', () => {
      // Mock process.env
      const originalEnv = { ...process.env };
      mockProcessEnv({ ...originalEnv, ANTHROPIC_API_KEY: 'env-test-key' }, { clear: true });

      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.getApiKey()).toBe('env-test-key');

      // Restore process.env
      mockProcessEnv(originalEnv, { clear: true });
    });

    it('should prefer config over environment variables', () => {
      // Mock process.env
      const originalEnv = { ...process.env };
      mockProcessEnv({ ...originalEnv, ANTHROPIC_API_KEY: 'env-test-key' }, { clear: true });

      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'config-test-key' },
      });

      expect(provider.getApiKey()).toBe('config-test-key');

      // Restore process.env
      mockProcessEnv(originalEnv, { clear: true });
    });
  });

  describe('getApiBaseUrl', () => {
    it('should return the base URL from config', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiBaseUrl: 'https://custom.anthropic.api' },
      });

      expect(provider.getApiBaseUrl()).toBe('https://custom.anthropic.api');
    });

    it('should use environment variables if no config URL is provided', () => {
      // Mock process.env
      const originalEnv = { ...process.env };
      mockProcessEnv(
        { ...originalEnv, ANTHROPIC_BASE_URL: 'https://env.anthropic.api' },
        { clear: true },
      );

      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.getApiBaseUrl()).toBe('https://env.anthropic.api');

      // Restore process.env
      mockProcessEnv(originalEnv, { clear: true });
    });
  });

  describe('callApi', () => {
    it('should throw an error when called directly', async () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      await expect(provider.callApi('test')).rejects.toThrow('Not implemented');
    });
  });

  describe('Claude Code OAuth authentication', () => {
    // Exercised via `AnthropicMessagesProvider` because only OAuth-capable
    // subclasses (those that opt in via `SUPPORTS_CLAUDE_CODE_OAUTH`) honor
    // the `apiKeyRequired: false` fallback.
    let restoreEnv: (() => void) | undefined;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_AUTH_TOKEN: undefined,
      });
    });

    afterEach(() => {
      restoreEnv?.();
      vi.resetAllMocks();
    });

    it('loads the Claude Code credential and configures the SDK when apiKeyRequired is false', () => {
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue({
        accessToken: 'sk-ant-oat-test',
        expiresAt: Date.now() + 60_000,
      });
      claudeCodeAuthMocks.isCredentialExpired.mockReturnValue(false);

      const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
        config: { apiKeyRequired: false },
      });

      expect(provider.usingClaudeCodeOAuth).toBe(true);
      expect(provider.requiresApiKey()).toBe(false);
      expect(provider.apiKey).toBeUndefined();
      // Bearer auth should be configured via the underlying Anthropic SDK.
      expect(provider.anthropic).toBeInstanceOf(Anthropic);
      expect(provider.anthropic.authToken).toBe('sk-ant-oat-test');
      expect(provider.anthropic.apiKey).toBeNull();
    });

    it('does not attempt to load a Claude Code credential when apiKeyRequired defaults to true', () => {
      restoreEnv?.();
      restoreEnv = mockProcessEnv({ ANTHROPIC_API_KEY: 'env-key' });
      const provider = new AnthropicMessagesProvider('claude-sonnet-4-6');

      expect(claudeCodeAuthMocks.loadClaudeCodeCredential).not.toHaveBeenCalled();
      expect(provider.usingClaudeCodeOAuth).toBe(false);
      expect(provider.requiresApiKey()).toBe(true);
      expect(provider.apiKey).toBe('env-key');
    });

    it('prefers an explicit API key over the Claude Code credential', () => {
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue({
        accessToken: 'sk-ant-oat-test',
        expiresAt: Date.now() + 60_000,
      });

      const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
        config: { apiKey: 'config-key', apiKeyRequired: false },
      });

      expect(provider.usingClaudeCodeOAuth).toBe(false);
      expect(provider.apiKey).toBe('config-key');
      // With an explicit key we should not have loaded a credential at all.
      expect(claudeCodeAuthMocks.loadClaudeCodeCredential).not.toHaveBeenCalled();
    });

    it('leaves usingClaudeCodeOAuth false when no credential is found', () => {
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(null);

      const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
        config: { apiKeyRequired: false },
      });

      expect(provider.usingClaudeCodeOAuth).toBe(false);
      expect(provider.apiKey).toBeUndefined();
      expect(provider.anthropic.authToken).toBeNull();
    });

    it('warns and stashes an expired credential so subclasses can throw at request time', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue({
        accessToken: 'sk-ant-oat-expired',
        expiresAt: Date.now() - 1000,
      });
      claudeCodeAuthMocks.isCredentialExpired.mockReturnValue(true);

      const provider = new AnthropicMessagesProvider('claude-sonnet-4-6', {
        config: { apiKeyRequired: false },
      });

      expect(provider.usingClaudeCodeOAuth).toBe(true);
      expect(provider.anthropic.authToken).toBe('sk-ant-oat-expired');
      // The constructor warns so users running with debug logging off still
      // see the issue; the actual request-time throw lives in the subclass
      // (covered in messages.test.ts).
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/expired.*claude \/login/));
      // The credential must be stashed on the provider so subclasses can
      // re-check expiry at request time without re-reading the keychain.
      expect(provider.claudeCodeCredential).toEqual({
        accessToken: 'sk-ant-oat-expired',
        expiresAt: expect.any(Number),
      });
    });

    it('does not load a Claude Code credential on non-OAuth subclasses even when apiKeyRequired: false', () => {
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue({
        accessToken: 'sk-ant-oat-test',
        expiresAt: Date.now() + 60_000,
      });

      // `AnthropicGenericProvider` does not opt into OAuth. Setting
      // apiKeyRequired: false on the base class must NOT load a credential
      // and MUST still require an API key upfront (so preflight catches
      // misconfiguration instead of letting the request fail at call time).
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiKeyRequired: false },
      });

      expect(claudeCodeAuthMocks.loadClaudeCodeCredential).not.toHaveBeenCalled();
      expect(provider.usingClaudeCodeOAuth).toBe(false);
      expect(provider.requiresApiKey()).toBe(true);
    });
  });

  describe('requiresApiKey', () => {
    it('returns true by default', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.requiresApiKey()).toBe(true);
    });

    it('ignores apiKeyRequired: false on non-OAuth subclasses (base class)', () => {
      // Scoping guard: only OAuth-capable subclasses like
      // `AnthropicMessagesProvider` may honor `apiKeyRequired: false`.
      claudeCodeAuthMocks.loadClaudeCodeCredential.mockReturnValue(null);
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiKeyRequired: false },
      });
      expect(provider.requiresApiKey()).toBe(true);
    });
  });
});
