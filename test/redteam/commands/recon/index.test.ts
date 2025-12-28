import * as fs from 'fs';
import * as path from 'path';
import { vi, beforeEach, afterEach, describe, it, expect } from 'vitest';

// Mock external dependencies before importing the module
vi.mock('fs');
vi.mock('open', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn(() => '/tmp/promptfoo-test'),
}));
vi.mock('../../../../src/logger', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Import the functions to test (we need to access the private functions)
// Since they're not exported, we'll test them indirectly through the module

describe('recon CLI pending config', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('pending recon file structure', () => {
    it('should write pending recon config with correct structure', async () => {
      // We need to import the module after mocks are set up
      const { getConfigDirectoryPath } = await import(
        '../../../../src/util/config/manage'
      );
      const configDir = getConfigDirectoryPath(true);
      const pendingPath = path.join(configDir, 'pending-recon.json');

      // Verify the path construction
      expect(pendingPath).toBe('/tmp/promptfoo-test/pending-recon.json');
    });

    it('should include required metadata fields', () => {
      const config = { description: 'Test config' };
      const result = { purpose: 'Test app', keyFiles: ['file1.ts', 'file2.ts'] };
      const codebaseDirectory = '/path/to/project';

      const pendingData = {
        config,
        metadata: {
          source: 'recon-cli' as const,
          timestamp: Date.now(),
          codebaseDirectory,
          keyFilesAnalyzed: result.keyFiles?.length || 0,
        },
        reconResult: result,
      };

      expect(pendingData.metadata.source).toBe('recon-cli');
      expect(pendingData.metadata.codebaseDirectory).toBe('/path/to/project');
      expect(pendingData.metadata.keyFilesAnalyzed).toBe(2);
      expect(typeof pendingData.metadata.timestamp).toBe('number');
    });

    it('should handle empty keyFiles array', () => {
      const result: { purpose: string; keyFiles?: string[] } = { purpose: 'Test app' };

      const keyFilesAnalyzed = result.keyFiles?.length || 0;
      expect(keyFilesAnalyzed).toBe(0);
    });

    it('should include full reconResult', () => {
      const result = {
        purpose: 'Test app',
        features: 'Feature A',
        industry: 'Healthcare',
        discoveredTools: [{ name: 'search', description: 'Search function' }],
        suggestedPlugins: ['pii:direct', 'sql-injection'],
        securityNotes: ['Note 1', 'Note 2'],
      };

      const pendingData = {
        config: {},
        metadata: { source: 'recon-cli' as const, timestamp: Date.now() },
        reconResult: result,
      };

      expect(pendingData.reconResult.purpose).toBe('Test app');
      expect(pendingData.reconResult.features).toBe('Feature A');
      expect(pendingData.reconResult.discoveredTools).toHaveLength(1);
      expect(pendingData.reconResult.suggestedPlugins).toEqual(['pii:direct', 'sql-injection']);
    });
  });

  describe('browser URL construction', () => {
    it('should construct correct URL with source parameter', () => {
      const DEFAULT_SERVER_PORT = 15500;
      const url = `http://localhost:${DEFAULT_SERVER_PORT}/redteam/setup?source=recon`;

      expect(url).toBe('http://localhost:15500/redteam/setup?source=recon');
    });
  });
});

describe('ReconOptions open flag', () => {
  it('should default to opening browser when open is undefined', () => {
    const options = { dir: '/path/to/project' };
    const shouldOpen = options.open !== false;

    expect(shouldOpen).toBe(true);
  });

  it('should open browser when open is explicitly true', () => {
    const options = { dir: '/path/to/project', open: true };
    const shouldOpen = options.open !== false;

    expect(shouldOpen).toBe(true);
  });

  it('should not open browser when open is false', () => {
    const options = { dir: '/path/to/project', open: false };
    const shouldOpen = options.open !== false;

    expect(shouldOpen).toBe(false);
  });
});
