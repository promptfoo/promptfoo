import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Database } from 'better-sqlite3';
import {
  assetStorageIndexes,
  analyzeIndexUsage,
  applyIndexOptimizations,
  getIndexStats,
  optimizeDatabase,
} from '../../src/database/optimizations';

jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Database Optimizations', () => {
  let tempDir: string;
  let db: any;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-db-test-'));
    
    // Create a mock database with minimal schema
    const sqlite3 = require('better-sqlite3');
    db = new sqlite3(path.join(tempDir, 'test.db'));
    
    // Create test tables that match our schema
    db.exec(`
      CREATE TABLE eval_results (
        id TEXT PRIMARY KEY,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        updated_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        eval_id TEXT NOT NULL,
        prompt_idx INTEGER NOT NULL,
        test_idx INTEGER NOT NULL,
        response TEXT,
        provider TEXT
      );
      
      CREATE TABLE evals (
        id TEXT PRIMARY KEY,
        created_at INTEGER DEFAULT CURRENT_TIMESTAMP,
        author TEXT,
        description TEXT,
        results TEXT,
        config TEXT
      );
    `);
    
    // Insert some test data
    for (let i = 0; i < 10; i++) {
      db.prepare(`
        INSERT INTO eval_results (id, eval_id, prompt_idx, test_idx, response, provider)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `result-${i}`,
        `eval-${Math.floor(i / 3)}`,
        i % 3,
        i,
        JSON.stringify({ output: i % 2 === 0 ? 'promptfoo://eval-1/result-1/asset-1' : 'normal output' }),
        JSON.stringify({ id: `provider-${i % 2}` })
      );
    }
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('analyzeIndexUsage', () => {
    it('should detect missing indexes', async () => {
      const analysis = await analyzeIndexUsage(db);
      
      // All our optimization indexes should be missing initially
      expect(analysis.missingIndexes.length).toBeGreaterThan(0);
      expect(analysis.missingIndexes).toContain('idx_eval_results_composite_lookup');
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('should not report existing indexes as missing', async () => {
      // Create an index
      db.exec('CREATE INDEX idx_eval_results_composite_lookup ON eval_results(eval_id, id)');
      
      const analysis = await analyzeIndexUsage(db);
      
      expect(analysis.missingIndexes).not.toContain('idx_eval_results_composite_lookup');
    });
  });

  describe('applyIndexOptimizations', () => {
    it('should create missing indexes', async () => {
      const result = await applyIndexOptimizations(db);
      
      expect(result.applied.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
      
      // Verify indexes were created
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE 'idx_%'
      `).all();
      
      const indexNames = indexes.map((idx: any) => idx.name);
      expect(indexNames).toContain('idx_eval_results_composite_lookup');
    });

    it('should skip existing indexes', async () => {
      // Create an index first
      db.exec('CREATE INDEX idx_eval_results_composite_lookup ON eval_results(eval_id, id)');
      
      const result = await applyIndexOptimizations(db);
      
      expect(result.skipped.some(s => s.includes('idx_eval_results_composite_lookup'))).toBe(true);
    });

    it('should support dry run mode', async () => {
      const result = await applyIndexOptimizations(db, { dryRun: true });
      
      expect(result.applied.length).toBeGreaterThan(0);
      expect(result.applied[0]).toContain('dry run');
      
      // Verify no indexes were actually created
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index' AND name LIKE 'idx_%'
      `).all();
      
      expect(indexes.length).toBe(0);
    });
  });

  describe('getIndexStats', () => {
    it('should return index statistics', async () => {
      // Create some indexes
      db.exec('CREATE INDEX test_idx1 ON eval_results(eval_id)');
      db.exec('CREATE INDEX test_idx2 ON eval_results(created_at)');
      db.exec('CREATE INDEX test_idx3 ON evals(created_at)');
      
      const stats = await getIndexStats(db);
      
      expect(stats.totalIndexes).toBeGreaterThanOrEqual(3);
      expect(stats.indexesByTable['eval_results']).toBeGreaterThanOrEqual(2);
      expect(stats.indexesByTable['evals']).toBeGreaterThanOrEqual(1);
      expect(typeof stats.fragmentationScore).toBe('number');
    });
  });

  describe('optimizeDatabase', () => {
    it('should vacuum and optimize the database', async () => {
      // Add and delete some data to create fragmentation
      for (let i = 0; i < 100; i++) {
        db.prepare(`
          INSERT INTO eval_results (id, eval_id, prompt_idx, test_idx, response, provider)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          `temp-${i}`,
          'eval-temp',
          0,
          i,
          JSON.stringify({ output: 'temp data '.repeat(100) }),
          JSON.stringify({ id: 'temp-provider' })
        );
      }
      
      // Delete the temp data
      db.prepare('DELETE FROM eval_results WHERE eval_id = ?').run('eval-temp');
      
      const result = await optimizeDatabase(db);
      
      expect(result.success).toBe(true);
      expect(result.sizeBeforeBytes).toBeDefined();
      expect(result.sizeAfterBytes).toBeDefined();
      expect(result.message).toContain('optimized');
    });
  });

  describe('assetStorageIndexes', () => {
    it('should have valid index definitions', () => {
      expect(assetStorageIndexes.length).toBeGreaterThan(0);
      
      for (const idx of assetStorageIndexes) {
        expect(idx.name).toBeTruthy();
        expect(idx.description).toBeTruthy();
        expect(idx.query).toContain('CREATE INDEX');
        expect(['high', 'medium', 'low']).toContain(idx.estimatedImpact);
      }
    });

    it('should have unique index names', () => {
      const names = assetStorageIndexes.map(idx => idx.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});