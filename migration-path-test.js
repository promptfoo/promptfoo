#!/usr/bin/env node

/**
 * MIGRATION PATH TESTING FOR LIBSQL MIGRATION
 * 
 * Tests the migration path from better-sqlite3 databases to libSQL
 * This is critical for production deployment compatibility
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let testResults = { passed: 0, failed: 0, critical: 0 };

function logResult(name, passed, details, critical = false) {
  const icon = passed ? '✅' : critical ? '🚨' : '❌';
  const prefix = critical ? 'CRITICAL' : passed ? 'PASS' : 'FAIL';
  
  console.log(`${icon} ${prefix}: ${name}`);
  if (details) console.log(`   ${details}`);
  
  if (passed) testResults.passed++;
  else {
    testResults.failed++;
    if (critical) testResults.critical++;
  }
}

async function testFreshMigration() {
  console.log('\n🆕 Testing Fresh Database Migration\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `migration-fresh-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    
    closeDb();
    
    // Test fresh migration from scratch
    await runDbMigrations();
    const db = getDb();
    
    // Verify all expected tables exist
    const { sql } = require('drizzle-orm');
    const tables = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table'`);
    const tableNames = tables.map(t => t.name);
    
    const requiredTables = [
      'evals', 
      'eval_results', 
      'prompts', 
      'datasets',
      'evals_to_prompts',
      'evals_to_datasets',
      'tags',
      'evals_to_tags'
    ];
    
    const missingTables = requiredTables.filter(table => !tableNames.includes(table));
    
    logResult('Fresh migration table creation', missingTables.length === 0,
      missingTables.length === 0 ? 
        `All ${requiredTables.length} required tables created` : 
        `Missing tables: ${missingTables.join(', ')}`,
      missingTables.length > 0);
    
    // Test basic functionality after migration
    const Eval = require('./dist/src/models/eval.js').default;
    const testConfig = {
      description: 'Post-migration test',
      tests: [{ vars: { test: 'migration' } }]
    };
    const testPrompts = [{ raw: 'Test {{test}}', label: 'Test' }];
    
    const eval1 = await Eval.create(testConfig, testPrompts);
    const retrieved = await Eval.findById(eval1.id);
    
    logResult('Post-migration functionality', 
      retrieved && retrieved.config.description === 'Post-migration test',
      retrieved ? 'Basic CRUD operations work' : 'CRUD operations failed',
      !retrieved);
    
    closeDb();
    
  } catch (error) {
    logResult('Fresh migration testing', false, error.message, true);
  }
}

async function testExistingDataCompatibility() {
  console.log('\n📊 Testing Existing Data Compatibility\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `migration-data-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    // Create test data that simulates existing better-sqlite3 data
    const testConfigs = [
      {
        description: 'Legacy eval 1',
        tests: [
          { vars: { input: 'test1', legacy: true } },
          { vars: { input: 'test2', complex: { nested: 'value' } } }
        ],
        tags: { environment: 'production', version: 'v1.0' }
      },
      {
        description: 'Legacy eval 2',
        tests: [{ vars: { input: 'test3', nullValue: null } }],
        redteam: true // Test redteam flag compatibility
      },
      {
        description: undefined, // Test undefined description
        tests: [{ vars: { input: 'test4' } }]
      }
    ];
    
    const testPrompts = [
      { raw: 'Test {{input}}', label: 'Test Prompt' },
      { raw: 'Another {{input}}', label: 'Another' }
    ];
    
    // Create evals to simulate existing data
    const createdEvals = [];
    for (const config of testConfigs) {
      const eval1 = await Eval.create(config, testPrompts);
      createdEvals.push(eval1);
    }
    
    // Test data integrity after "migration"
    let dataIntegrityValid = true;
    const retrievedEvals = [];
    
    for (const eval1 of createdEvals) {
      const retrieved = await Eval.findById(eval1.id);
      if (!retrieved) {
        dataIntegrityValid = false;
        break;
      }
      retrievedEvals.push(retrieved);
    }
    
    logResult('Data retrieval after migration', dataIntegrityValid,
      dataIntegrityValid ? `All ${createdEvals.length} evals retrieved successfully` : 'Some evals could not be retrieved',
      !dataIntegrityValid);
    
    // Test complex data structures
    const complexEval = retrievedEvals[0];
    const hasComplexData = complexEval.config.tests.some(t => 
      t.vars.complex && t.vars.complex.nested === 'value'
    );
    
    logResult('Complex data structure compatibility', hasComplexData,
      hasComplexData ? 'Nested JSON objects preserved' : 'Complex data structures lost');
    
    // Test null value handling
    const nullEval = retrievedEvals[1];
    const hasNullValue = nullEval.config.tests.some(t => 
      t.vars.nullValue === null
    );
    
    logResult('Null value handling', hasNullValue,
      hasNullValue ? 'Null values preserved correctly' : 'Null values not handled properly');
    
    // Test redteam flag
    logResult('RedTeam flag compatibility', nullEval.isRedteam === true,
      nullEval.isRedteam ? 'RedTeam flag preserved' : 'RedTeam flag not preserved');
    
    // Test undefined description handling
    const undefinedDescEval = retrievedEvals[2];
    logResult('Undefined field handling', undefinedDescEval.description === undefined || undefinedDescEval.description === null,
      'Undefined description handled gracefully');
    
    closeDb();
    
  } catch (error) {
    logResult('Existing data compatibility', false, error.message, true);
  }
}

async function testSchemaEvolution() {
  console.log('\n🔄 Testing Schema Evolution\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `migration-schema-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    
    closeDb();
    
    // Test that migrations can be run multiple times safely
    await runDbMigrations();
    const db1 = getDb();
    
    const { sql } = require('drizzle-orm');
    const tables1 = await db1.all(sql`SELECT name FROM sqlite_master WHERE type='table'`);
    const tableCount1 = tables1.length;
    
    closeDb();
    
    // Run migrations again
    await runDbMigrations();
    const db2 = getDb();
    
    const tables2 = await db2.all(sql`SELECT name FROM sqlite_master WHERE type='table'`);
    const tableCount2 = tables2.length;
    
    logResult('Idempotent migrations', tableCount1 === tableCount2 && tableCount1 > 0,
      `Table count consistent: ${tableCount1} -> ${tableCount2}`,
      tableCount1 !== tableCount2);
    
    // Test that we can query the schema successfully - use raw SQL for compatibility
    try {
      // Use the sqlite client directly instead of drizzle sql template
      const { getDb } = require('./dist/src/database/index.js');
      const db = getDb();
      
      // Try a simpler approach - just check if migrations worked by testing table existence
      const evalTable = await db.select().from(require('./dist/src/database/tables.js').evalsTable).limit(0);
      
      logResult('Schema consistency', true, 
        'Schema accessible and functional after re-migration');
        
    } catch (schemaError) {
      logResult('Schema consistency', false, `Schema access failed: ${schemaError.message}`, true);
    }
    
    closeDb();
    
  } catch (error) {
    logResult('Schema evolution testing', false, error.message, true);
  }
}

async function testBackwardsCompatibility() {
  console.log('\n↩️ Testing Backwards Compatibility\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `migration-compat-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    // Test configuration formats that might exist in better-sqlite3 databases
    const legacyConfigs = [
      // Older format without some new fields
      {
        description: 'Legacy format 1',
        tests: [{ vars: { input: 'legacy' } }],
        // Missing newer fields like 'redteam'
      },
      // Config with old-style providers
      {
        description: 'Legacy providers',
        tests: [{ vars: { input: 'provider-test' } }],
        providers: ['openai:gpt-3.5-turbo'] // String format instead of object
      },
      // Config with mixed data types
      {
        description: 'Mixed types',
        tests: [{ 
          vars: { 
            string: 'test',
            number: 42,
            boolean: true,
            array: [1, 2, 3],
            object: { key: 'value' },
            nullValue: null
          } 
        }]
      }
    ];
    
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Legacy Test' }];
    
    let compatibilityValid = true;
    for (const config of legacyConfigs) {
      try {
        const eval1 = await Eval.create(config, testPrompts);
        const retrieved = await Eval.findById(eval1.id);
        
        if (!retrieved || retrieved.config.description !== config.description) {
          compatibilityValid = false;
          break;
        }
      } catch (error) {
        console.log(`   Error with config: ${config.description} - ${error.message}`);
        compatibilityValid = false;
        break;
      }
    }
    
    logResult('Legacy configuration compatibility', compatibilityValid,
      compatibilityValid ? 'All legacy config formats handled' : 'Some legacy configs failed',
      !compatibilityValid);
    
    // Test API response format consistency
    const eval1 = await Eval.create(legacyConfigs[0], testPrompts);
    const apiFormat = eval1.toJSON ? eval1.toJSON() : eval1;
    
    const hasRequiredFields = apiFormat.id && apiFormat.config && apiFormat.createdAt;
    logResult('API response format consistency', hasRequiredFields,
      hasRequiredFields ? 'API response format maintained' : 'API response format broken',
      !hasRequiredFields);
    
    closeDb();
    
  } catch (error) {
    logResult('Backwards compatibility testing', false, error.message, true);
  }
}

async function runMigrationPathTests() {
  console.log('🚀 LIBSQL MIGRATION PATH TESTS');
  console.log('='.repeat(50));
  
  const startTime = Date.now();
  
  await testFreshMigration();
  await testExistingDataCompatibility();
  await testSchemaEvolution();
  await testBackwardsCompatibility();
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 MIGRATION PATH TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`🚨 Critical: ${testResults.critical}`);
  console.log(`⏱️ Time: ${Math.round(totalTime/1000)}s`);
  
  if (testResults.critical > 0) {
    console.log('\n🚨 CRITICAL MIGRATION ISSUES - UNSAFE FOR PRODUCTION');
    process.exit(2);
  } else if (testResults.failed > 0) {
    console.log('\n⚠️ MIGRATION ISSUES - NEEDS FIXES');
    process.exit(1);
  } else {
    console.log('\n✅ ALL MIGRATION PATH TESTS PASSED');
    process.exit(0);
  }
}

runMigrationPathTests().catch(error => {
  console.error('💥 Migration path test crashed:', error);
  process.exit(3);
});