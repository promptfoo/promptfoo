import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPendingConfig,
  createReconHandoffToken,
  deletePendingReconConfig,
  getPendingReconPath,
  hasPendingReconConfig,
  InvalidPendingReconError,
  readPendingReconConfig,
  writePendingReconConfig,
} from '../../../../src/redteam/commands/recon/pending';

const mockedConfig = vi.hoisted(() => ({ dir: '' }));

vi.mock('../../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn((createDir = false) => {
    if (createDir) {
      fs.mkdirSync(mockedConfig.dir, { recursive: true });
    }
    return mockedConfig.dir;
  }),
}));

vi.mock('../../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

function createPendingConfig() {
  return buildPendingConfig(
    { description: 'Recon config' },
    {
      purpose: 'Support assistant',
      features: 'Account lookup',
      industry: 'Finance',
      systemPrompt: 'Stay helpful.',
      hasAccessTo: 'CRM',
      doesNotHaveAccessTo: 'Raw passwords',
      userTypes: 'Customers',
      securityRequirements: 'Protect account data',
      sensitiveDataTypes: 'PII',
      exampleIdentifiers: 'acct_123',
      criticalActions: 'Refund',
      forbiddenTopics: 'Secrets',
      attackConstraints: 'No production writes',
      competitors: 'Other assistants',
      connectedSystems: 'CRM',
      redteamUser: 'QA',
      stateful: true,
      entities: ['Acme'],
      discoveredTools: [{ name: 'lookup', description: 'Lookup user' }],
      securityNotes: ['High privilege'],
      keyFiles: ['src/app.ts'],
      suggestedPlugins: ['pii:direct'],
    },
    '/repo',
    'a'.repeat(43),
  );
}

describe('pending recon config helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConfig.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-pending-recon-'));
  });

  afterEach(() => {
    fs.rmSync(mockedConfig.dir, { recursive: true, force: true });
  });

  it('writes, reads, detects, and deletes a valid pending config', () => {
    const config = createPendingConfig();
    const pendingPath = writePendingReconConfig(config);

    expect(pendingPath).toBe(path.join(mockedConfig.dir, 'pending-recon.json'));
    expect(getPendingReconPath()).toBe(pendingPath);
    expect(hasPendingReconConfig()).toBe(true);
    expect(readPendingReconConfig()).toEqual(config);
    if (process.platform !== 'win32') {
      expect(fs.statSync(pendingPath).mode & 0o777).toBe(0o600);
    }
    expect(deletePendingReconConfig()).toBe(true);
    expect(deletePendingReconConfig()).toBe(false);
    expect(hasPendingReconConfig()).toBe(false);
  });

  it('populates handoff access context from discovered tools when hasAccessTo is missing', () => {
    const config = buildPendingConfig(
      { description: 'Recon config' },
      {
        purpose: 'Support assistant',
        discoveredTools: [
          { name: 'lookupOrder', description: 'Reads order status' },
          { name: 'cancelOrder', description: 'Cancels pending orders' },
        ],
      },
      '/repo',
      'b'.repeat(43),
    );

    expect(config.metadata.applicationDefinition?.hasAccessTo).toContain('lookupOrder');
    expect(config.metadata.applicationDefinition?.hasAccessTo).toContain('cancelOrder');
  });

  it('returns null when no pending config exists', () => {
    expect(readPendingReconConfig()).toBeNull();
  });

  it('generates unpredictable browser handoff tokens', () => {
    const first = createReconHandoffToken();
    const second = createReconHandoffToken();

    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).not.toBe(second);
  });

  it('throws for malformed JSON and deletes the corrupted file by default', () => {
    const pendingPath = getPendingReconPath(true);
    fs.writeFileSync(pendingPath, 'not json');

    expect(() => readPendingReconConfig()).toThrow(InvalidPendingReconError);
    expect(fs.existsSync(pendingPath)).toBe(false);
  });

  it('preserves malformed JSON when deleteOnError is disabled', () => {
    const pendingPath = getPendingReconPath(true);
    fs.writeFileSync(pendingPath, 'not json');

    expect(() => readPendingReconConfig({ deleteOnError: false })).toThrow(
      'Pending recon file contains malformed JSON',
    );
    expect(fs.existsSync(pendingPath)).toBe(true);
  });

  it('throws for invalid schema data and honors deleteOnError', () => {
    const pendingPath = getPendingReconPath(true);
    fs.writeFileSync(
      pendingPath,
      JSON.stringify({
        config: {},
        metadata: { timestamp: Date.now() },
      }),
    );

    expect(() => readPendingReconConfig({ deleteOnError: false })).toThrow(
      'Invalid pending recon file format',
    );
    expect(fs.existsSync(pendingPath)).toBe(true);

    expect(() => readPendingReconConfig()).toThrow(InvalidPendingReconError);
    expect(fs.existsSync(pendingPath)).toBe(false);
  });
});
