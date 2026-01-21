import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_PROVIDER_PREFIX,
  DEFAULT_API_BASE_URL,
  DEFAULT_QUERY_LIMIT,
  getDefaultPort,
  getDefaultShareViewBaseUrl,
  getShareApiBaseUrl,
  getShareViewBaseUrl,
  TERMINAL_MAX_WIDTH,
  VERSION,
} from '../src/constants';
import { REDTEAM_DEFAULTS } from '../src/redteam/constants';

describe('constants', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {};
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should export VERSION from package.json', () => {
    expect(VERSION).toBeDefined();
  });

  it('should have DEFAULT_QUERY_LIMIT set to 100', () => {
    expect(DEFAULT_QUERY_LIMIT).toBe(100);
  });

  it('should have DEFAULT_API_BASE_URL set to api.promptfoo.app', () => {
    expect(DEFAULT_API_BASE_URL).toBe('https://api.promptfoo.app');
  });

  it('should have REDTEAM_DEFAULTS with correct values', () => {
    expect(REDTEAM_DEFAULTS.MAX_CONCURRENCY).toBe(4);
    expect(REDTEAM_DEFAULTS.NUM_TESTS).toBe(10);
  });

  describe('getShareApiBaseUrl', () => {
    it('should return DEFAULT_API_BASE_URL by default', () => {
      expect(getShareApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
    });

    it('should return PROMPTFOO_REMOTE_API_BASE_URL if set', () => {
      process.env.PROMPTFOO_REMOTE_API_BASE_URL = 'https://remote.api.com';
      expect(getShareApiBaseUrl()).toBe('https://remote.api.com');
    });
  });

  describe('getDefaultShareViewBaseUrl', () => {
    it('should return promptfoo.app by default', () => {
      expect(getDefaultShareViewBaseUrl()).toBe('https://promptfoo.app');
    });

    it('should return PROMPTFOO_SHARING_APP_BASE_URL if set', () => {
      process.env.PROMPTFOO_SHARING_APP_BASE_URL = 'https://custom.share.com';
      expect(getDefaultShareViewBaseUrl()).toBe('https://custom.share.com');
    });
  });

  describe('getShareViewBaseUrl', () => {
    it('should return promptfoo.app by default', () => {
      expect(getShareViewBaseUrl()).toBe('https://promptfoo.app');
    });

    it('should return PROMPTFOO_REMOTE_APP_BASE_URL if set', () => {
      process.env.PROMPTFOO_REMOTE_APP_BASE_URL = 'https://remote.app.com';
      expect(getShareViewBaseUrl()).toBe('https://remote.app.com');
    });
  });

  describe('getDefaultPort', () => {
    it('should return 15500 by default', () => {
      expect(getDefaultPort()).toBe(15500);
    });

    it('should return API_PORT if set', () => {
      process.env.API_PORT = '3000';
      expect(getDefaultPort()).toBe(3000);
    });

    it('should handle invalid API_PORT value', () => {
      process.env.API_PORT = 'invalid';
      expect(getDefaultPort()).toBe(15500);
    });
  });

  describe('TERMINAL_MAX_WIDTH', () => {
    it('should match expected terminal width', () => {
      const expectedWidth =
        process?.stdout?.isTTY && process?.stdout?.columns && process?.stdout?.columns > 10
          ? process.stdout.columns - 10
          : 120;

      expect(TERMINAL_MAX_WIDTH).toBe(expectedWidth);
    });
  });

  it('should have CLOUD_PROVIDER_PREFIX set correctly', () => {
    expect(CLOUD_PROVIDER_PREFIX).toBe('promptfoo://provider/');
  });
});
