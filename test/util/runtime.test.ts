import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/envars', () => ({
  getEnvString: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
  },
}));

import { getEnvString } from '../../src/envars';
import logger from '../../src/logger';
import { isRunningUnderNpx, printBorder } from '../../src/util/runtime';

describe('runtime utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('printBorder', () => {
    it('should call logger.info with a border string', () => {
      printBorder();

      expect(logger.info).toHaveBeenCalledTimes(1);
      const call = vi.mocked(logger.info).mock.calls[0][0];
      expect(typeof call).toBe('string');
      expect(call).toMatch(/^=+$/);
    });

    it('should print a border of repeated equals signs', () => {
      printBorder();

      const border = vi.mocked(logger.info).mock.calls[0][0] as string;
      expect(border.length).toBeGreaterThan(0);
      expect(border.split('').every((char) => char === '=')).toBe(true);
    });
  });

  describe('isRunningUnderNpx', () => {
    const originalExecPath = process.execPath;

    afterEach(() => {
      Object.defineProperty(process, 'execPath', {
        value: originalExecPath,
        writable: true,
      });
    });

    it('should return false when not running under npx', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(isRunningUnderNpx()).toBe(false);
    });

    it('should return true when npm_execpath contains npx', () => {
      (vi.mocked(getEnvString) as any).mockImplementation((key: string) => {
        if (key === 'npm_execpath') {
          return '/usr/local/lib/node_modules/npm/bin/npx-cli.js';
        }
        return undefined;
      });
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(isRunningUnderNpx()).toBe(true);
    });

    it('should return true when process.execPath contains npx', () => {
      vi.mocked(getEnvString).mockReturnValue(undefined as unknown as string);
      Object.defineProperty(process, 'execPath', {
        value: '/home/user/.npm/_npx/123/node_modules/.bin/node',
        writable: true,
      });

      expect(isRunningUnderNpx()).toBe(true);
    });

    it('should return true when npm_lifecycle_script contains npx', () => {
      (vi.mocked(getEnvString) as any).mockImplementation((key: string) => {
        if (key === 'npm_lifecycle_script') {
          return 'npx promptfoo eval';
        }
        return undefined;
      });
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(isRunningUnderNpx()).toBe(true);
    });

    it('should return false when env vars are empty strings', () => {
      vi.mocked(getEnvString).mockReturnValue('');
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(isRunningUnderNpx()).toBe(false);
    });

    it('should check npm_execpath first', () => {
      (vi.mocked(getEnvString) as any).mockImplementation((key: string) => {
        if (key === 'npm_execpath') {
          return '/path/to/npx';
        }
        if (key === 'npm_lifecycle_script') {
          return 'some other script';
        }
        return undefined;
      });
      Object.defineProperty(process, 'execPath', {
        value: '/usr/local/bin/node',
        writable: true,
      });

      expect(isRunningUnderNpx()).toBe(true);
      expect(getEnvString).toHaveBeenCalledWith('npm_execpath');
    });
  });
});
