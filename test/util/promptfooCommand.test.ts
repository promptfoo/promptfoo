import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isRunningUnderNpx, promptfooCommand } from '../../src/util/promptfooCommand';
import { mockProcessEnv } from './utils';

describe('promptfooCommand', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockProcessEnv({ ...originalEnv }, { clear: true });
  });

  afterEach(() => {
    mockProcessEnv(originalEnv, { clear: true });
  });

  describe('promptfooCommand', () => {
    it('should return npx command for npx installer', () => {
      mockProcessEnv({ npm_execpath: '/path/to/npx' });
      expect(promptfooCommand('eval')).toBe('npx promptfoo@latest eval');
    });

    it('should return regular command for brew installer', () => {
      mockProcessEnv({ npm_config_prefix: '/usr/local/Homebrew/Cellar/node/20.0.0/bin' });
      expect(promptfooCommand('eval')).toBe('promptfoo eval');
    });

    it('should return regular command for npm-global installer', () => {
      mockProcessEnv({ npm_config_user_agent: 'npm/10.8.2 node/v18.20.4' });
      expect(promptfooCommand('eval')).toBe('promptfoo eval');
    });

    it('should return regular command for unknown installer', () => {
      mockProcessEnv({ npm_config_user_agent: 'yarn/1.22.0' });
      expect(promptfooCommand('eval')).toBe('promptfoo eval');
    });

    it('should handle complex subcommands', () => {
      mockProcessEnv({ npm_execpath: '/path/to/npx' });
      expect(promptfooCommand('redteam init')).toBe('npx promptfoo@latest redteam init');
    });

    it('should handle subcommands with flags', () => {
      mockProcessEnv({ npm_execpath: '/path/to/npx' });
      expect(promptfooCommand('eval -c config.yaml')).toBe(
        'npx promptfoo@latest eval -c config.yaml',
      );
    });

    it('should handle empty subcommand for npx', () => {
      mockProcessEnv({ npm_execpath: '/path/to/npx' });
      expect(promptfooCommand('')).toBe('npx promptfoo@latest');
    });

    it('should handle empty subcommand for non-npx', () => {
      mockProcessEnv({ npm_config_prefix: '/usr/local/Homebrew/Cellar/node/20.0.0/bin' });
      expect(promptfooCommand('')).toBe('promptfoo');
    });
  });

  describe('isRunningUnderNpx (legacy compatibility)', () => {
    it('should return true for npx installer', () => {
      mockProcessEnv({ npm_execpath: '/path/to/npx' });
      expect(isRunningUnderNpx()).toBe(true);
    });

    it('should return false for non-npx installers', () => {
      mockProcessEnv({ npm_config_prefix: '/usr/local/Homebrew/Cellar/node/20.0.0/bin' });
      expect(isRunningUnderNpx()).toBe(false);
    });
  });
});
