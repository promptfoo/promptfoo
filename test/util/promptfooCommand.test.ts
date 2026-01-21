import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectInstaller,
  isRunningUnderNpx,
  promptfooCommand,
} from '../../src/util/promptfooCommand';

describe('nextCommand', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('detectInstaller', () => {
    it('should detect npx from npm_execpath', () => {
      process.env.npm_execpath = '/path/to/npx';
      expect(detectInstaller()).toBe('npx');
    });

    it('should detect npx from npm_lifecycle_script', () => {
      process.env.npm_lifecycle_script = 'npx some-command';
      expect(detectInstaller()).toBe('npx');
    });

    it('should detect npx from process.execPath', () => {
      const originalExecPath = process.execPath;
      Object.defineProperty(process, 'execPath', {
        value: '/path/to/npx/node',
        configurable: true,
      });

      expect(detectInstaller()).toBe('npx');

      Object.defineProperty(process, 'execPath', {
        value: originalExecPath,
        configurable: true,
      });
    });

    it('should detect npx from npm_config_user_agent', () => {
      process.env.npm_config_user_agent = 'npx/10.5.0 npm/10.8.2 node/v18.20.4';
      expect(detectInstaller()).toBe('npx');
    });

    it('should detect brew from npm_config_prefix', () => {
      process.env.npm_config_prefix = '/usr/local/Homebrew/Cellar/node/20.0.0/bin';
      expect(detectInstaller()).toBe('brew');
    });

    it('should detect brew from process.execPath', () => {
      const originalExecPath = process.execPath;
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/Homebrew/bin/node',
        configurable: true,
      });

      expect(detectInstaller()).toBe('brew');

      Object.defineProperty(process, 'execPath', {
        value: originalExecPath,
        configurable: true,
      });
    });

    it('should detect npm-global from npm_config_user_agent', () => {
      process.env.npm_config_user_agent = 'npm/10.8.2 node/v18.20.4';
      expect(detectInstaller()).toBe('npm-global');
    });

    it('should return unknown for unrecognized patterns', () => {
      process.env.npm_config_user_agent = 'yarn/1.22.0';
      expect(detectInstaller()).toBe('unknown');
    });

    it('should prioritize npm_execpath over user agent', () => {
      process.env.npm_execpath = '/path/to/npx';
      process.env.npm_config_user_agent = 'npm/10.8.2 node/v18.20.4';
      expect(detectInstaller()).toBe('npx');
    });

    it('should prioritize npm_lifecycle_script over user agent', () => {
      process.env.npm_lifecycle_script = 'npx some-command';
      process.env.npm_config_user_agent = 'npm/10.8.2 node/v18.20.4';
      expect(detectInstaller()).toBe('npx');
    });

    it('should handle empty environment variables', () => {
      delete process.env.npm_execpath;
      delete process.env.npm_lifecycle_script;
      delete process.env.npm_config_prefix;
      delete process.env.npm_config_user_agent;
      expect(detectInstaller()).toBe('unknown');
    });

    it('should handle case insensitive homebrew detection', () => {
      process.env.npm_config_prefix = '/usr/local/homebrew/cellar/node/20.0.0/bin';
      expect(detectInstaller()).toBe('brew');
    });

    it('should detect brew with Windows-style paths', () => {
      process.env.npm_config_prefix = 'C:\\Users\\user\\homebrew\\Cellar\\node\\20.0.0\\bin';
      expect(detectInstaller()).toBe('brew');
    });
  });

  describe('promptfooCommand', () => {
    it('should return npx command for npx installer', () => {
      process.env.npm_execpath = '/path/to/npx';
      expect(promptfooCommand('eval')).toBe('npx promptfoo@latest eval');
    });

    it('should return regular command for brew installer', () => {
      process.env.npm_config_prefix = '/usr/local/Homebrew/Cellar/node/20.0.0/bin';
      expect(promptfooCommand('eval')).toBe('promptfoo eval');
    });

    it('should return regular command for npm-global installer', () => {
      process.env.npm_config_user_agent = 'npm/10.8.2 node/v18.20.4';
      expect(promptfooCommand('eval')).toBe('promptfoo eval');
    });

    it('should return regular command for unknown installer', () => {
      process.env.npm_config_user_agent = 'yarn/1.22.0';
      expect(promptfooCommand('eval')).toBe('promptfoo eval');
    });

    it('should handle complex subcommands', () => {
      process.env.npm_execpath = '/path/to/npx';
      expect(promptfooCommand('redteam init')).toBe('npx promptfoo@latest redteam init');
    });

    it('should handle subcommands with flags', () => {
      process.env.npm_execpath = '/path/to/npx';
      expect(promptfooCommand('eval -c config.yaml')).toBe(
        'npx promptfoo@latest eval -c config.yaml',
      );
    });

    it('should handle empty subcommand for npx', () => {
      process.env.npm_execpath = '/path/to/npx';
      expect(promptfooCommand('')).toBe('npx promptfoo@latest');
    });

    it('should handle empty subcommand for non-npx', () => {
      process.env.npm_config_prefix = '/usr/local/Homebrew/Cellar/node/20.0.0/bin';
      expect(promptfooCommand('')).toBe('promptfoo');
    });
  });

  describe('isRunningUnderNpx (legacy compatibility)', () => {
    it('should return true for npx installer', () => {
      process.env.npm_execpath = '/path/to/npx';
      expect(isRunningUnderNpx()).toBe(true);
    });

    it('should return false for non-npx installers', () => {
      process.env.npm_config_prefix = '/usr/local/Homebrew/Cellar/node/20.0.0/bin';
      expect(isRunningUnderNpx()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle partial matches in strings', () => {
      process.env.npm_execpath = '/some/path/with-npx-in-middle/but-not-npx';
      expect(detectInstaller()).toBe('npx'); // Should still match because contains 'npx'
    });

    it('should handle npm_config_user_agent with multiple patterns', () => {
      process.env.npm_config_user_agent = 'npx/10.5.0 npm/10.8.2 node/v18.20.4';
      expect(detectInstaller()).toBe('npx'); // Should detect npx, not npm
    });

    it('should handle undefined environment variables gracefully', () => {
      delete process.env.npm_execpath;
      delete process.env.npm_lifecycle_script;
      delete process.env.npm_config_prefix;
      delete process.env.npm_config_user_agent;

      expect(() => detectInstaller()).not.toThrow();
      expect(detectInstaller()).toBe('unknown');
    });
  });
});
