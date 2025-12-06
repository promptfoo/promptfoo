import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promptfooCommand, isRunningUnderNpx } from '../../src/util/promptfooCommand';

describe('promptfooCommand', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
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
});
