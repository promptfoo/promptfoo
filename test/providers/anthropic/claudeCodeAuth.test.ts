import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  homedir: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mocks.execFileSync,
}));

vi.mock('node:fs', async () => ({
  default: {
    existsSync: mocks.existsSync,
    readFileSync: mocks.readFileSync,
  },
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}));

vi.mock('node:os', async () => ({
  default: { homedir: mocks.homedir },
  homedir: mocks.homedir,
}));

import {
  CLAUDE_CODE_IDENTITY_PROMPT,
  CLAUDE_CODE_OAUTH_BETA_FEATURES,
  isCredentialExpired,
  loadClaudeCodeCredential,
} from '../../../src/providers/anthropic/claudeCodeAuth';

describe('claudeCodeAuth', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;

  function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execFileSync.mockReset();
    mocks.existsSync.mockReset();
    mocks.readFileSync.mockReset();
    mocks.homedir.mockReset();
    mocks.homedir.mockReturnValue('/home/tester');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  describe('constants', () => {
    it('exposes the Claude Code identity prompt expected by the Anthropic API', () => {
      expect(CLAUDE_CODE_IDENTITY_PROMPT).toBe(
        "You are Claude Code, Anthropic's official CLI for Claude.",
      );
    });

    it('requires both the claude-code and oauth beta features', () => {
      expect([...CLAUDE_CODE_OAUTH_BETA_FEATURES]).toEqual([
        'claude-code-20250219',
        'oauth-2025-04-20',
      ]);
    });
  });

  describe('loadClaudeCodeCredential', () => {
    it('returns a credential parsed from the macOS keychain on darwin', () => {
      setPlatform('darwin');
      const blob = JSON.stringify({
        claudeAiOauth: {
          accessToken: 'sk-ant-oat-kc',
          refreshToken: 'refresh-kc',
          expiresAt: 2_000_000_000_000,
          subscriptionType: 'max',
        },
      });
      mocks.execFileSync.mockReturnValue(`${blob}\n`);

      const credential = loadClaudeCodeCredential();

      expect(credential).toEqual({
        accessToken: 'sk-ant-oat-kc',
        refreshToken: 'refresh-kc',
        expiresAt: 2_000_000_000_000,
        subscriptionType: 'max',
      });
      expect(mocks.execFileSync).toHaveBeenCalledWith(
        'security',
        ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
        expect.objectContaining({ encoding: 'utf-8', timeout: 5000 }),
      );
      // Should short-circuit before touching the filesystem.
      expect(mocks.existsSync).not.toHaveBeenCalled();
    });

    it('falls back to ~/.claude/.credentials.json when the keychain lookup fails', () => {
      setPlatform('darwin');
      mocks.execFileSync.mockImplementation(() => {
        throw new Error('user denied keychain access');
      });
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'sk-ant-oat-file',
            refreshToken: 'refresh-file',
            expiresAt: 1_999_000_000_000,
          },
        }),
      );

      const credential = loadClaudeCodeCredential();

      expect(credential).toEqual({
        accessToken: 'sk-ant-oat-file',
        refreshToken: 'refresh-file',
        expiresAt: 1_999_000_000_000,
      });
      expect(mocks.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('/.claude/.credentials.json'),
        'utf-8',
      );
    });

    it('reads from the credentials file on Linux and skips the keychain', () => {
      setPlatform('linux');
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue(
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'sk-ant-oat-linux',
            expiresAt: 1_900_000_000_000,
          },
        }),
      );

      const credential = loadClaudeCodeCredential();

      expect(credential?.accessToken).toBe('sk-ant-oat-linux');
      expect(credential?.expiresAt).toBe(1_900_000_000_000);
      expect(mocks.execFileSync).not.toHaveBeenCalled();
    });

    it('returns null when the credentials file is missing', () => {
      setPlatform('linux');
      mocks.existsSync.mockReturnValue(false);

      expect(loadClaudeCodeCredential()).toBeNull();
      expect(mocks.readFileSync).not.toHaveBeenCalled();
    });

    it('returns null when the credential payload is malformed', () => {
      setPlatform('linux');
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue('{"claudeAiOauth": {}}');

      expect(loadClaudeCodeCredential()).toBeNull();
    });

    it('returns null when the credentials file is not valid JSON', () => {
      setPlatform('linux');
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue('{not json');

      expect(loadClaudeCodeCredential()).toBeNull();
    });
  });

  describe('isCredentialExpired', () => {
    it('returns false for credentials without an expiry', () => {
      expect(isCredentialExpired({ accessToken: 'x' })).toBe(false);
    });

    it('returns true once the expiry has passed', () => {
      expect(isCredentialExpired({ accessToken: 'x', expiresAt: Date.now() - 1000 })).toBe(true);
    });

    it('returns false for an expiry in the future', () => {
      expect(isCredentialExpired({ accessToken: 'x', expiresAt: Date.now() + 60_000 })).toBe(false);
    });
  });
});
