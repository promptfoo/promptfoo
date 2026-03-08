import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldShareResults } from '../../src/util/sharing';

vi.mock('../../src/envars', () => ({
  getEnvBool: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    isEnabled: vi.fn().mockReturnValue(false),
    getSharing: vi.fn().mockReturnValue(undefined),
  },
}));

import { getEnvBool } from '../../src/envars';
import { cloudConfig } from '../../src/globalConfig/cloud';

describe('shouldShareResults', () => {
  beforeEach(() => {
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    vi.mocked(cloudConfig.getSharing).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('explicit disable', () => {
    it('should return false when cliNoShare is true', () => {
      expect(shouldShareResults({ cliNoShare: true })).toBe(false);
    });

    it('should return false when cliShare is false', () => {
      expect(shouldShareResults({ cliShare: false })).toBe(false);
    });

    it('should return false when PROMPTFOO_DISABLE_SHARING env var is set', () => {
      vi.mocked(getEnvBool).mockReturnValue(true);
      expect(shouldShareResults({})).toBe(false);
    });
  });

  describe('explicit enable', () => {
    it('should return true when cliShare is true', () => {
      expect(shouldShareResults({ cliShare: true })).toBe(true);
    });
  });

  describe('config file settings', () => {
    it('should return true when configShare is truthy', () => {
      expect(shouldShareResults({ configShare: true })).toBe(true);
    });

    it('should return false when configShare is false', () => {
      expect(shouldShareResults({ configShare: false })).toBe(false);
    });

    it('should return true when configSharing is truthy', () => {
      expect(shouldShareResults({ configSharing: true })).toBe(true);
    });

    it('should return false when configSharing is false', () => {
      expect(shouldShareResults({ configSharing: false })).toBe(false);
    });
  });

  describe('default behavior', () => {
    it('should return false when cloud is not enabled', () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      expect(shouldShareResults({})).toBe(false);
    });

    it('should return true when cloud is enabled but sharing is undefined (pre-migration backward compat)', () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getSharing).mockReturnValue(undefined);
      expect(shouldShareResults({})).toBe(true);
    });

    it('should return false when cloud is enabled but sharing is false', () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getSharing).mockReturnValue(false);
      expect(shouldShareResults({})).toBe(false);
    });

    it('should return true when cloud is enabled and sharing is true', () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getSharing).mockReturnValue(true);
      expect(shouldShareResults({})).toBe(true);
    });
  });
});
