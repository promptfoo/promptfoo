import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import * as yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearUserEmail, setUserEmail } from '../src/globalConfig/accounts';
import { CLOUD_API_HOST, CloudConfig } from '../src/globalConfig/cloud';
import {
  readGlobalConfig,
  updateGlobalConfig,
  writeGlobalConfig,
  writeGlobalConfigPartial,
} from '../src/globalConfig/globalConfig';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../src/util/config/manage';
import { fetchWithProxy } from '../src/util/fetch/index';

import type { GlobalConfig } from '../src/configTypes';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

vi.mock('../src/util/fetch/index');
vi.mock('../src/logger');

const previousDirectory = getConfigDirectoryPath();
let directory: string;
let configPath: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-global-config-'));
  configPath = path.join(directory, 'promptfoo.yaml');
  setConfigDirectoryPath(directory);
  vi.stubEnv('PROMPTFOO_API_KEY', undefined);
  vi.stubEnv('PROMPTFOO_CLOUD_API_URL', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  setConfigDirectoryPath(previousDirectory);
  fs.rmSync(directory, { recursive: true, force: true });
});

function readFile(): GlobalConfig {
  return yaml.load(fs.readFileSync(configPath, 'utf8')) as GlobalConfig;
}

const oldConfig: GlobalConfig = {
  id: 'installation',
  hasHarmfulRedteamConsent: true,
  account: { email: 'old@example.com', emailValidated: true, emailNeedsValidation: false },
  cloud: {
    apiKey: 'old-token',
    apiHost: 'https://old.example.com',
    appUrl: 'https://old-app.example.com',
    sharing: true,
    currentOrganizationId: 'old-org',
    currentTeamId: 'legacy-team',
    teams: {
      'old-org': { currentTeamId: 'old-team' },
      'new-org': { currentTeamId: 'stale-team' },
    },
  },
};

const session = {
  token: 'new-token',
  apiHost: `${CLOUD_API_HOST}/`,
  authHeaderName: 'X-Cloud-Key',
  user: { id: 'new-user', name: 'New User', email: 'new@example.com' },
  organization: { id: 'new-org', name: 'New Organization' },
  app: { url: 'https://www.promptfoo.app' },
  teamId: 'new-team',
};

describe('global configuration persistence', () => {
  it('creates a persistent installation ID and a private file', () => {
    const config = readGlobalConfig();
    expect(config.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(readGlobalConfig()).toEqual(config);
    expect(readFile()).toEqual(config);
    if (process.platform !== 'win32') {
      expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
    }
  });

  it.each(['', 'account:\n  email: test@example.com\n'])(
    'adds an ID to existing config %j',
    (contents) => {
      fs.writeFileSync(configPath, contents);
      const config = readGlobalConfig();
      expect(config.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(readFile()).toEqual(config);
      if (contents) {
        expect(config.account?.email).toBe('test@example.com');
      }
    },
  );

  it('does not overwrite invalid YAML', () => {
    const invalid = 'invalid: yaml: content:';
    fs.writeFileSync(configPath, invalid);
    expect(() => readGlobalConfig()).toThrow();
    expect(fs.readFileSync(configPath, 'utf8')).toBe(invalid);
  });

  it('replaces and removes only requested top-level keys', () => {
    writeGlobalConfig(oldConfig);
    writeGlobalConfigPartial({ account: { email: 'replacement@example.com' }, cloud: undefined });
    expect(readFile()).toEqual({
      id: 'installation',
      hasHarmfulRedteamConsent: true,
      account: { email: 'replacement@example.com' },
    });
  });

  it('reads changes from other instances and preserves unrelated updates', () => {
    writeGlobalConfig(oldConfig);
    const first = new CloudConfig();
    const second = new CloudConfig();
    second.setCurrentTeamId('changed-team', 'old-org');
    expect(first.getCurrentTeamId('old-org')).toBe('changed-team');
    updateGlobalConfig((config) => {
      config.hasHarmfulRedteamConsent = false;
    });
    first.setSharing(false);
    expect(readFile()).toMatchObject({
      hasHarmfulRedteamConsent: false,
      cloud: { sharing: false, teams: { 'old-org': { currentTeamId: 'changed-team' } } },
    });
  });

  it('keeps a request snapshot coherent while a later request sees a replacement session', () => {
    writeGlobalConfig(oldConfig);
    const first = new CloudConfig();
    const second = new CloudConfig();
    const request = first.getRequestConfig();
    second.saveValidatedApiToken(session);
    expect(request).toEqual({
      apiHost: 'https://old.example.com',
      authHeaderName: 'Authorization',
      headers: { Authorization: 'Bearer old-token' },
      teamId: 'old-team',
    });
    expect(first.getRequestConfig()).toEqual({
      apiHost: CLOUD_API_HOST,
      authHeaderName: 'X-Cloud-Key',
      headers: { 'X-Cloud-Key': 'Bearer new-token' },
      teamId: 'new-team',
    });
  });

  it('uses a legacy team only when no organization is selected', () => {
    writeGlobalConfig({ cloud: { currentTeamId: 'legacy' } });
    const config = new CloudConfig();
    expect(config.getRequestConfig().teamId).toBe('legacy');
    config.setCurrentOrganization('organization');
    expect(config.getRequestConfig().teamId).toBeUndefined();
  });

  it('does not restore deleted credentials through an older instance', () => {
    writeGlobalConfig(oldConfig);
    const first = new CloudConfig();
    const second = new CloudConfig();
    second.delete();
    expect(first.getApiKey()).toBeUndefined();
    expect(first.getCurrentOrganizationId()).toBeUndefined();
    first.setCurrentTeamId('future-team', 'future-org');
    expect(readFile()).toEqual({
      id: 'installation',
      hasHarmfulRedteamConsent: true,
      account: {},
      cloud: { teams: { 'future-org': { currentTeamId: 'future-team' } } },
    });
  });

  it('uses the current directory after deferred initialization', () => {
    const config = new CloudConfig(false);
    const nested = path.join(directory, 'worker');
    setConfigDirectoryPath(nested);
    config.setApiKey('worker-token');
    expect(fs.existsSync(configPath)).toBe(false);
    expect(config.getApiKey()).toBe('worker-token');
    expect(yaml.load(fs.readFileSync(path.join(nested, 'promptfoo.yaml'), 'utf8'))).toMatchObject({
      cloud: { apiKey: 'worker-token' },
    });
  });

  it('preserves file permissions and cleans up temporary files', () => {
    writeGlobalConfig(oldConfig);
    fs.chmodSync(configPath, 0o640);
    const mode = fs.statSync(configPath).mode & 0o777;
    writeGlobalConfigPartial({ hasHarmfulRedteamConsent: false });
    expect(fs.statSync(configPath).mode & 0o777).toBe(mode);
    expect(fs.readdirSync(directory)).toEqual(['promptfoo.yaml']);
  });

  it('cleans up an incomplete write and leaves the saved session intact', () => {
    writeGlobalConfig(oldConfig);
    const write = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((file) => {
      write(file, 'partial');
      throw new Error('disk full');
    });
    expect(() => new CloudConfig().saveValidatedApiToken(session)).toThrow('disk full');
    expect(readFile()).toEqual(oldConfig);
    expect(fs.readdirSync(directory)).toEqual(['promptfoo.yaml']);
  });

  it('keeps the previous session intact when replacement fails', () => {
    writeGlobalConfig(oldConfig);
    const config = new CloudConfig();
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('disk unavailable');
    });
    expect(() => config.saveValidatedApiToken(session)).toThrow('disk unavailable');
    expect(readFile()).toEqual(oldConfig);
    expect(config.getApiKey()).toBe('old-token');
    expect(fs.readdirSync(directory)).toEqual(['promptfoo.yaml']);
  });
});

describe('saved login session', () => {
  beforeEach(() => writeGlobalConfig(oldConfig));

  it('commits credentials, email, organization, team, and sharing in one replacement', () => {
    const rename = vi.mocked(fs.renameSync).mockClear();
    new CloudConfig().saveValidatedApiToken(session);
    expect(rename).toHaveBeenCalledOnce();
    expect(readFile()).toEqual({
      id: 'installation',
      hasHarmfulRedteamConsent: true,
      account: { email: 'new@example.com', emailValidated: false, emailNeedsValidation: true },
      cloud: {
        apiKey: 'new-token',
        apiHost: CLOUD_API_HOST,
        appUrl: 'https://www.promptfoo.app',
        authHeaderName: 'X-Cloud-Key',
        sharing: false,
        currentOrganizationId: 'new-org',
        teams: {
          'old-org': { currentTeamId: 'old-team' },
          'new-org': { currentTeamId: 'new-team' },
        },
      },
    });
  });

  it('preserves the selected organization preference when team discovery did not complete', () => {
    new CloudConfig().saveValidatedApiToken({ ...session, teamId: undefined });
    expect(readFile().cloud?.teams?.['new-org']?.currentTeamId).toBe('stale-team');
    expect(readFile().cloud?.currentOrganizationId).toBe('new-org');
    expect(readFile().cloud?.currentTeamId).toBeUndefined();
  });

  it('clears active selection after an authoritative empty team lookup and remembers other organizations', () => {
    new CloudConfig().saveValidatedApiToken({ ...session, teamId: null });
    expect(readFile().cloud).toMatchObject({
      currentOrganizationId: 'new-org',
      teams: { 'old-org': { currentTeamId: 'old-team' } },
    });
    expect(readFile().cloud?.teams?.['new-org']).toBeUndefined();
    expect(readFile().cloud?.currentTeamId).toBeUndefined();
  });

  it.each([
    { user: undefined },
    { user: { id: 'new-user', name: 'New User' } },
    { user: { id: 'new-user', name: 'New User', email: 'invalid' } },
    { organization: undefined },
    { organization: { name: 'Missing ID' } },
    { app: {} },
    { app: { url: 'invalid' } },
  ])('rejects incomplete server response %j before any session write', async (missing) => {
    const response = { ...session, ...missing };
    vi.mocked(fetchWithProxy).mockResolvedValue({
      ok: true,
      json: async () => response,
    } as Response);
    const config = new CloudConfig();
    await expect(config.validateApiToken('new-token', CLOUD_API_HOST)).rejects.toThrow(
      'Invalid Cloud login response',
    );
    expect(() => config.saveValidatedApiToken(response as typeof session)).toThrow(
      'Invalid Cloud login response',
    );
    expect(readFile()).toEqual(oldConfig);
  });

  it('accepts optional legacy license and creation dates without inheriting old sharing', () => {
    new CloudConfig().saveValidatedApiToken(session);
    expect(readFile().cloud?.sharing).toBe(false);
    new CloudConfig().saveValidatedApiToken({
      ...session,
      user: { ...session.user, createdAt: '2026-01-01' },
    });
    expect(readFile().cloud?.sharing).toBe(true);
  });
});

describe('email identity state', () => {
  beforeEach(() => writeGlobalConfig(oldConfig));

  it('resets verification for a different email and preserves it for the same address', () => {
    setUserEmail('old@example.com');
    expect(readFile().account).toEqual(oldConfig.account);
    setUserEmail('new@example.com');
    expect(readFile().account).toEqual({
      email: 'new@example.com',
      emailValidated: false,
      emailNeedsValidation: true,
    });
    expect(readFile().cloud).toEqual(oldConfig.cloud);
  });

  it.each([clearUserEmail, () => setUserEmail('')])(
    'clears verification with the email',
    (clear) => {
      clear();
      expect(readFile().account).toEqual({});
      expect(readFile().cloud).toEqual(oldConfig.cloud);
    },
  );
});
