import { sql } from 'drizzle-orm';
import { getDb } from '../database';

/**
 * Migration: Add performance indices to eval_results table
 * 
 * This migration adds critical missing indices that will significantly
 * improve query performance for the eval pages.
 * 
 * Expected improvements:
 * - 50-70% reduction in query time for getTablePage
 * - Faster filtering and pagination
 * - Reduced I/O operations
 */
export async function up() {
  const db = getDb();
  const startTime = Date.now();
  
  console.log('📊 Starting migration: Add eval_results indices');
  
  try {
    // 1. Primary composite index for the most common access pattern
    console.log('  Creating index: idx_eval_results_eval_test...');
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_eval_results_eval_test 
      ON eval_results(eval_id, test_idx)
    `);
    console.log('  ✅ Created idx_eval_results_eval_test');
    
    // 2. Index for filtering by success/failure
    console.log('  Creating index: idx_eval_results_eval_success...');
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_eval_results_eval_success 
      ON eval_results(eval_id, success)
    `);
    console.log('  ✅ Created idx_eval_results_eval_success');
    
    // 3. Index for filtering by failure reason
    console.log('  Creating index: idx_eval_results_eval_failure...');
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_eval_results_eval_failure 
      ON eval_results(eval_id, failure_reason)
    `);
    console.log('  ✅ Created idx_eval_results_eval_failure');
    
    // 4. Composite index for pagination with creation date
    console.log('  Creating index: idx_eval_results_eval_test_created...');
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_eval_results_eval_test_created 
      ON eval_results(eval_id, test_idx, created_at)
    `);
    console.log('  ✅ Created idx_eval_results_eval_test_created');
    
    // 5. Run ANALYZE to update SQLite's query planner statistics
    console.log('  Updating query planner statistics...');
    await db.run(sql`ANALYZE eval_results`);
    console.log('  ✅ Updated statistics');
    
    const duration = Date.now() - startTime;
    console.log(`\n✅ Migration completed successfully in ${duration}ms`);
    
    // Show index information
    const indices = await db.all(sql`
      SELECT name, sql 
      FROM sqlite_master 
      WHERE type = 'index' 
      AND tbl_name = 'eval_results'
      ORDER BY name
    `);
    
    console.log('\n📋 Current indices on eval_results:');
    indices.forEach((idx: any) => {
      console.log(`  - ${idx.name}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Rollback migration by dropping the indices
 */
export async function down() {
  const db = getDb();
  
  console.log('🔙 Rolling back migration: Remove eval_results indices');
  
  try {
    await db.run(sql`DROP INDEX IF EXISTS idx_eval_results_eval_test`);
    await db.run(sql`DROP INDEX IF EXISTS idx_eval_results_eval_success`);
    await db.run(sql`DROP INDEX IF EXISTS idx_eval_results_eval_failure`);
    await db.run(sql`DROP INDEX IF EXISTS idx_eval_results_eval_test_created`);
    
    console.log('✅ Rollback completed successfully');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  }
}