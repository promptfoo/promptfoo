import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/database', () => ({
  getDbPath: () => '/mock/promptfoo.db',
}));

interface DrizzleConfigForTest {
  dbCredentials: {
    url: string;
    authToken?: string;
  };
}

async function loadConfig(): Promise<DrizzleConfigForTest> {
  vi.resetModules();
  const module = await import('../../drizzle.config');
  return module.default as DrizzleConfigForTest;
}

describe('drizzle.config credentials (#1759)', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      TURSO_CONNECTION_URL: undefined,
      TURSO_AUTH_TOKEN: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('falls back to the local database when no URL is configured', async () => {
    const config = await loadConfig();
    expect(config.dbCredentials).toEqual({ url: 'file:/mock/promptfoo.db' });
  });

  it('uses TURSO_CONNECTION_URL and TURSO_AUTH_TOKEN when set', async () => {
    restoreEnv();
    restoreEnv = mockProcessEnv({
      TURSO_CONNECTION_URL: 'libsql://example.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
    });

    const config = await loadConfig();
    expect(config.dbCredentials).toEqual({
      url: 'libsql://example.turso.io',
      authToken: 'test-token',
    });
  });

  it('uses the URL without an auth token when only the URL is configured', async () => {
    restoreEnv();
    restoreEnv = mockProcessEnv({ TURSO_CONNECTION_URL: 'libsql://example.turso.io' });

    const config = await loadConfig();
    expect(config.dbCredentials).toEqual({ url: 'libsql://example.turso.io' });
  });

  it('does not send a token meant for a remote database to the local database', async () => {
    restoreEnv();
    restoreEnv = mockProcessEnv({ TURSO_AUTH_TOKEN: 'test-token' });

    const config = await loadConfig();
    expect(config.dbCredentials).toEqual({ url: 'file:/mock/promptfoo.db' });
  });
});
