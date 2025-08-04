import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AssetMigrator } from '../../src/migrate/assets';
import { getDb } from '../../src/util/database';

jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key, defaultValue) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') {
      return true;
    }
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') {
      return false; // Disable for migration tests
    }
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
  getEnvString: jest.fn((key) => undefined),
  getEnvFloat: jest.fn((key, defaultValue) => defaultValue),
}));

describe('AssetMigrator', () => {
  let tempDir: string;
  let migrator: AssetMigrator;
  let db: any;
  
  const mockGetConfigDirectoryPath = jest.requireMock('../../src/util/config/manage').getConfigDirectoryPath;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-migrate-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    
    // Initialize database
    db = getDb();
    
    // Create test table (simplified version)
    await db.run(`
      CREATE TABLE IF NOT EXISTS eval_results (
        id TEXT PRIMARY KEY,
        evalId TEXT NOT NULL,
        response TEXT,
        createdAt TEXT NOT NULL
      )
    `);
    
    migrator = new AssetMigrator();
  });

  afterEach(async () => {
    // Clean up
    await db.run('DROP TABLE IF EXISTS eval_results');
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('migrate', () => {
    it('should migrate base64 images to asset storage', async () => {
      // Insert test data with base64 image
      const base64Image = Buffer.from('test image data').toString('base64');
      const response = {
        output: `data:image/png;base64,${base64Image}`,
        other: 'data',
      };
      
      await db.run(
        'INSERT INTO eval_results (id, evalId, response, createdAt) VALUES (?, ?, ?, ?)',
        'result-1',
        'eval-1',
        JSON.stringify(response),
        new Date().toISOString()
      );
      
      // Run migration
      const result = await migrator.migrate();
      
      expect(result.totalResults).toBe(1);
      expect(result.processedResults).toBe(1);
      expect(result.migratedAssets).toBe(1);
      expect(result.bytesFreed).toBe(base64Image.length);
      
      // Check database was updated
      const updated = await db.get('SELECT response FROM eval_results WHERE id = ?', 'result-1');
      const updatedResponse = JSON.parse(updated.response);
      
      expect(updatedResponse.output).toMatch(/^!\[Migrated image\]\(asset:\/\//);
      expect(updatedResponse.other).toBe('data'); // Other data preserved
    });

    it('should migrate audio data to asset storage', async () => {
      // Insert test data with audio
      const base64Audio = Buffer.from('test audio data').toString('base64');
      const response = {
        output: 'some text',
        audio: {
          data: base64Audio,
          format: 'wav',
        },
      };
      
      await db.run(
        'INSERT INTO eval_results (id, evalId, response, createdAt) VALUES (?, ?, ?, ?)',
        'result-2',
        'eval-2',
        JSON.stringify(response),
        new Date().toISOString()
      );
      
      // Run migration
      const result = await migrator.migrate();
      
      expect(result.migratedAssets).toBe(1);
      expect(result.bytesFreed).toBe(base64Audio.length);
      
      // Check database was updated
      const updated = await db.get('SELECT response FROM eval_results WHERE id = ?', 'result-2');
      const updatedResponse = JSON.parse(updated.response);
      
      expect(updatedResponse.output).toMatch(/^\[Audio\]\(asset:\/\//);
      expect(updatedResponse.audio).toBeUndefined(); // Audio data removed
    });

    it('should respect dry run mode', async () => {
      // Insert test data
      const base64Image = Buffer.from('test image').toString('base64');
      const response = {
        output: `data:image/png;base64,${base64Image}`,
      };
      
      await db.run(
        'INSERT INTO eval_results (id, evalId, response, createdAt) VALUES (?, ?, ?, ?)',
        'result-3',
        'eval-3',
        JSON.stringify(response),
        new Date().toISOString()
      );
      
      // Run migration in dry run mode
      const result = await migrator.migrate({ dryRun: true });
      
      expect(result.migratedAssets).toBe(1);
      
      // Check database was NOT updated
      const unchanged = await db.get('SELECT response FROM eval_results WHERE id = ?', 'result-3');
      expect(unchanged.response).toBe(JSON.stringify(response));
    });

    it('should filter by eval IDs', async () => {
      // Insert multiple results
      for (let i = 1; i <= 3; i++) {
        await db.run(
          'INSERT INTO eval_results (id, evalId, response, createdAt) VALUES (?, ?, ?, ?)',
          `result-${i}`,
          `eval-${i}`,
          JSON.stringify({ output: `data:image/png;base64,${Buffer.from(`img${i}`).toString('base64')}` }),
          new Date().toISOString()
        );
      }
      
      // Migrate only eval-2
      const result = await migrator.migrate({ evalIds: ['eval-2'] });
      
      expect(result.totalResults).toBe(1);
      expect(result.migratedAssets).toBe(1);
    });

    it('should handle migration errors gracefully', async () => {
      // Insert invalid data
      await db.run(
        'INSERT INTO eval_results (id, evalId, response, createdAt) VALUES (?, ?, ?, ?)',
        'result-bad',
        'eval-bad',
        'invalid json',
        new Date().toISOString()
      );
      
      // Should not throw
      const result = await migrator.migrate();
      
      expect(result.failedMigrations).toBe(1);
      expect(result.errors.length).toBe(1);
    });
  });

  describe('estimateSavings', () => {
    it('should estimate migration savings', async () => {
      // Insert test data
      const imageSize = 1000;
      const audioSize = 2000;
      
      await db.run(
        'INSERT INTO eval_results (id, evalId, response, createdAt) VALUES (?, ?, ?, ?)',
        'result-1',
        'eval-1',
        JSON.stringify({ 
          output: `data:image/png;base64,${'a'.repeat(imageSize)}` 
        }),
        new Date().toISOString()
      );
      
      await db.run(
        'INSERT INTO eval_results (id, evalId, response, createdAt) VALUES (?, ?, ?, ?)',
        'result-2',
        'eval-2',
        JSON.stringify({ 
          audio: { data: 'b'.repeat(audioSize), format: 'wav' }
        }),
        new Date().toISOString()
      );
      
      const estimate = await migrator.estimateSavings();
      
      expect(estimate.totalResults).toBe(2);
      expect(estimate.estimatedAssets).toBe(2);
      expect(estimate.estimatedSavings).toBe(imageSize + audioSize);
    });

    it('should handle empty database gracefully', async () => {
      const estimate = await migrator.estimateSavings();
      
      expect(estimate.totalResults).toBe(0);
      expect(estimate.estimatedAssets).toBe(0);
      expect(estimate.estimatedSavings).toBe(0);
    });
  });
});