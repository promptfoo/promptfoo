import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';

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
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
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
      // Use a platform-agnostic matcher so the test passes on Windows, where
      // the path separator is `\` rather than `/`.
      expect(mocks.readFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/[/\\]\.claude[/\\]\.credentials\.json$/),
        'utf-8',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to read Claude Code credential from macOS keychain'),
        expect.objectContaining({ error: expect.stringContaining('user denied keychain access') }),
      );
    });

    it('falls through silently when the macOS keychain entry is simply missing (exit 44)', () => {
      setPlatform('darwin');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mocks.execFileSync.mockImplementation(() => {
        const err = new Error('The specified item could not be found in the keychain.') as Error & {
          status?: number;
        };
        err.status = 44;
        throw err;
      });
      mocks.existsSync.mockReturnValue(false);

      expect(loadClaudeCodeCredential()).toBeNull();
      // Exit 44 is "entry not present" — we should NOT warn the user about
      // this; it's the common "first run, not logged in yet" path.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns when the macOS keychain returns an empty entry', () => {
      setPlatform('darwin');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mocks.execFileSync.mockReturnValue('   \n');
      mocks.existsSync.mockReturnValue(false);

      expect(loadClaudeCodeCredential()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('keychain entry is empty'));
    });

    it('warns with the parse reason when the macOS keychain entry is malformed', () => {
      setPlatform('darwin');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mocks.execFileSync.mockReturnValue('{"claudeAiOauth": {}}');
      mocks.existsSync.mockReturnValue(false);

      expect(loadClaudeCodeCredential()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing `claudeAiOauth.accessToken` string'),
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

    it('returns null silently when the credentials file is missing', () => {
      setPlatform('linux');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mocks.existsSync.mockReturnValue(false);

      expect(loadClaudeCodeCredential()).toBeNull();
      expect(mocks.readFileSync).not.toHaveBeenCalled();
      // Missing file is the common "not logged in" path — do not warn here,
      // the caller surfaces a single user-facing warning instead.
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('warns with the parse reason when the credential shape is malformed', () => {
      setPlatform('linux');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue('{"claudeAiOauth": {}}');

      expect(loadClaudeCodeCredential()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing `claudeAiOauth.accessToken` string'),
      );
    });

    it('warns with the JSON error when the credentials file is not valid JSON', () => {
      setPlatform('linux');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockReturnValue('{not json');

      expect(loadClaudeCodeCredential()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'));
    });

    it('warns when the credentials file exists but is unreadable', () => {
      setPlatform('linux');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
      mocks.existsSync.mockReturnValue(true);
      mocks.readFileSync.mockImplementation(() => {
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      });

      expect(loadClaudeCodeCredential()).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('exists but could not be read'),
        expect.objectContaining({ error: expect.stringContaining('EACCES') }),
      );
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
