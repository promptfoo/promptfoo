/**
 * Database Index Optimization Plan for Asset Storage
 * 
 * This file contains optimizations specifically for improving performance
 * when using the asset storage feature.
 */

import { sql } from 'drizzle-orm';
import { index } from 'drizzle-orm/sqlite-core';
import type { SQLiteDatabase } from 'drizzle-orm/sqlite-core';

/**
 * Index Optimization Strategy:
 * 
 * 1. Asset-Related Queries:
 *    - eval_results often queried by evalId + resultId for asset lookups
 *    - Need composite index on (evalId, id) for asset serving
 *    - Response field contains asset URLs, needs efficient JSON extraction
 * 
 * 2. Migration Queries:
 *    - Need to efficiently find results with base64 data
 *    - JSON path queries on response field
 * 
 * 3. General Performance:
 *    - Composite indexes for common join patterns
 *    - Covering indexes to avoid table lookups
 */

export interface IndexOptimization {
  name: string;
  description: string;
  query: string;
  estimatedImpact: 'high' | 'medium' | 'low';
}

export const assetStorageIndexes: IndexOptimization[] = [
  {
    name: 'idx_eval_results_composite_lookup',
    description: 'Composite index for asset URL lookups (evalId + id)',
    query: `CREATE INDEX IF NOT EXISTS idx_eval_results_composite_lookup 
            ON eval_results(eval_id, id)`,
    estimatedImpact: 'high',
  },
  {
    name: 'idx_eval_results_response_assets',
    description: 'Index for finding results with promptfoo:// asset URLs',
    query: `CREATE INDEX IF NOT EXISTS idx_eval_results_response_assets 
            ON eval_results(id) 
            WHERE json_extract(response, '$.output') LIKE '%promptfoo://%'`,
    estimatedImpact: 'high',
  },
  {
    name: 'idx_eval_results_response_base64',
    description: 'Index for finding results with base64 data (for migration)',
    query: `CREATE INDEX IF NOT EXISTS idx_eval_results_response_base64 
            ON eval_results(id, eval_id) 
            WHERE json_extract(response, '$.output') LIKE '%data:image/%' 
               OR json_extract(response, '$.output') LIKE '%data:audio/%'`,
    estimatedImpact: 'medium',
  },
  {
    name: 'idx_eval_results_created_provider',
    description: 'Composite index for time-based queries with provider filtering',
    query: `CREATE INDEX IF NOT EXISTS idx_eval_results_created_provider 
            ON eval_results(created_at, json_extract(provider, '$.id'))`,
    estimatedImpact: 'medium',
  },
  {
    name: 'idx_evals_created_desc',
    description: 'Descending index for recent evaluations listing',
    query: `CREATE INDEX IF NOT EXISTS idx_evals_created_desc 
            ON evals(created_at DESC)`,
    estimatedImpact: 'medium',
  },
];

/**
 * Analyze current index usage and suggest optimizations
 */
export async function analyzeIndexUsage(db: any): Promise<{
  unusedIndexes: string[];
  missingIndexes: string[];
  recommendations: string[];
}> {
  const result = {
    unusedIndexes: [] as string[],
    missingIndexes: [] as string[],
    recommendations: [] as string[],
  };

  try {
    // Check for unused indexes (SQLite doesn't track this directly, so we'd need to implement query logging)
    // For now, we'll focus on missing indexes
    
    // Check if our optimization indexes exist
    for (const optimization of assetStorageIndexes) {
      const indexName = optimization.name;
      const checkQuery = `
        SELECT name 
        FROM sqlite_master 
        WHERE type='index' AND name=?
      `;
      
      const exists = await db.get(checkQuery, [indexName]);
      if (!exists) {
        result.missingIndexes.push(indexName);
        result.recommendations.push(
          `Create ${indexName}: ${optimization.description} (Impact: ${optimization.estimatedImpact})`
        );
      }
    }

    // Check for redundant indexes
    const allIndexes = await db.all(`
      SELECT name, tbl_name, sql 
      FROM sqlite_master 
      WHERE type='index' 
        AND name NOT LIKE 'sqlite_%'
      ORDER BY tbl_name, name
    `);

    // Analyze for potential redundancies
    const indexesByTable = new Map<string, any[]>();
    for (const idx of allIndexes) {
      if (!indexesByTable.has(idx.tbl_name)) {
        indexesByTable.set(idx.tbl_name, []);
      }
      indexesByTable.get(idx.tbl_name)!.push(idx);
    }

    // Add general recommendations
    if (result.missingIndexes.length === 0) {
      result.recommendations.push('All recommended indexes are present');
    }

  } catch (error) {
    console.error('Error analyzing indexes:', error);
    result.recommendations.push('Error analyzing indexes - manual review recommended');
  }

  return result;
}

/**
 * Apply index optimizations
 */
export async function applyIndexOptimizations(
  db: any,
  options: { dryRun?: boolean } = {}
): Promise<{
  applied: string[];
  skipped: string[];
  errors: string[];
}> {
  const result = {
    applied: [] as string[],
    skipped: [] as string[],
    errors: [] as string[],
  };

  for (const optimization of assetStorageIndexes) {
    try {
      // Check if index already exists
      const exists = await db.get(
        `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
        [optimization.name]
      );

      if (exists) {
        result.skipped.push(`${optimization.name} (already exists)`);
        continue;
      }

      if (options.dryRun) {
        console.log(`[DRY RUN] Would create index: ${optimization.name}`);
        result.applied.push(`${optimization.name} (dry run)`);
      } else {
        await db.run(optimization.query);
        result.applied.push(optimization.name);
        console.log(`Created index: ${optimization.name}`);
      }
    } catch (error: any) {
      result.errors.push(`${optimization.name}: ${error.message}`);
      console.error(`Error creating index ${optimization.name}:`, error);
    }
  }

  return result;
}

/**
 * Get index statistics and recommendations
 */
export async function getIndexStats(db: any): Promise<{
  totalIndexes: number;
  indexesByTable: Record<string, number>;
  largestIndexes: Array<{ name: string; table: string; estimatedSize: string }>;
  fragmentationScore: number;
}> {
  const stats = {
    totalIndexes: 0,
    indexesByTable: {} as Record<string, number>,
    largestIndexes: [] as Array<{ name: string; table: string; estimatedSize: string }>,
    fragmentationScore: 0,
  };

  try {
    // Get all indexes
    const indexes = await db.all(`
      SELECT name, tbl_name 
      FROM sqlite_master 
      WHERE type='index' 
        AND name NOT LIKE 'sqlite_%'
    `);

    stats.totalIndexes = indexes.length;

    // Count by table
    for (const idx of indexes) {
      stats.indexesByTable[idx.tbl_name] = (stats.indexesByTable[idx.tbl_name] || 0) + 1;
    }

    // Estimate fragmentation (simplified - actual implementation would need more analysis)
    const pageStats = await db.get('PRAGMA page_count; PRAGMA freelist_count;');
    if (pageStats) {
      stats.fragmentationScore = Math.round((pageStats.freelist_count / pageStats.page_count) * 100);
    }

  } catch (error) {
    console.error('Error getting index stats:', error);
  }

  return stats;
}

/**
 * Vacuum and optimize database
 */
export async function optimizeDatabase(db: any): Promise<{
  success: boolean;
  sizeBeforeBytes?: number;
  sizeAfterBytes?: number;
  message: string;
}> {
  try {
    // Get size before
    const statsBefore = await db.get('PRAGMA page_count; PRAGMA page_size;');
    const sizeBeforeBytes = statsBefore.page_count * statsBefore.page_size;

    // Run VACUUM
    await db.run('VACUUM');

    // Update statistics
    await db.run('ANALYZE');

    // Get size after
    const statsAfter = await db.get('PRAGMA page_count; PRAGMA page_size;');
    const sizeAfterBytes = statsAfter.page_count * statsAfter.page_size;

    const savedBytes = sizeBeforeBytes - sizeAfterBytes;
    const savedPercent = Math.round((savedBytes / sizeBeforeBytes) * 100);

    return {
      success: true,
      sizeBeforeBytes,
      sizeAfterBytes,
      message: `Database optimized. Saved ${savedBytes} bytes (${savedPercent}%)`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Optimization failed: ${error.message}`,
    };
  }
}