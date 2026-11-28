import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDatabaseCredentials } from '../../src/database/index';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: () => '/mock/config',
}));

describe('getDatabaseCredentials (#1759)', () => {
  let restoreEnv: () => void;

  function setEnv(overrides: Record<string, string | undefined>): void {
    restoreEnv();
    restoreEnv = mockProcessEnv({
      TURSO_CONNECTION_URL: undefined,
      TURSO_AUTH_TOKEN: undefined,
      ...overrides,
    });
  }

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      TURSO_CONNECTION_URL: undefined,
      TURSO_AUTH_TOKEN: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('uses the shared in-memory database while testing, even with a remote URL set', () => {
    setEnv({
      TURSO_CONNECTION_URL: 'libsql://example.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
    });

    expect(getDatabaseCredentials(true)).toEqual({
      url: 'file::memory:?cache=shared',
      isRemote: false,
    });
  });

  it('uses the hosted URL and token when configured', () => {
    setEnv({
      TURSO_CONNECTION_URL: 'libsql://example.turso.io',
      TURSO_AUTH_TOKEN: 'test-token',
    });

    expect(getDatabaseCredentials(false)).toEqual({
      url: 'libsql://example.turso.io',
      authToken: 'test-token',
      isRemote: true,
    });
  });

  it('uses the hosted URL without a token when no token is configured', () => {
    setEnv({ TURSO_CONNECTION_URL: 'libsql://example.turso.io' });

    expect(getDatabaseCredentials(false)).toEqual({
      url: 'libsql://example.turso.io',
      isRemote: true,
    });
  });

  it('keeps using the local database when no remote URL is configured', () => {
    setEnv({ TURSO_AUTH_TOKEN: 'test-token' });

    expect(getDatabaseCredentials(false)).toEqual({
      url: pathToFileURL('/mock/config/promptfoo.db').href,
      isRemote: false,
    });
  });
});
