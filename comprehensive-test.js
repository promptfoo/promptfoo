#!/usr/bin/env node

/**
 * COMPREHENSIVE LIBSQL MIGRATION VALIDATION
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

async function testDatabaseOperations() {
  console.log('\n🔍 Testing Database Operations\n');
  
  try {
    // Setup clean environment
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `comprehensive-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    const db = getDb();
    
    // Test 1: Database structure
    const { sql } = require('drizzle-orm');
    const tables = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table'`);
    const requiredTables = ['evals', 'eval_results', 'prompts', 'datasets'];
    const hasAllTables = requiredTables.every(table => 
      tables.some(t => t.name === table)
    );
    
    logResult('Database structure validation', hasAllTables, 
      hasAllTables ? `Found ${tables.length} tables` : 'Missing required tables', !hasAllTables);
    
    // Test 2: Basic CRUD operations
    const testConfig = {
      description: 'CRUD test',
      tests: [{ vars: { test: 'value' } }]
    };
    const testPrompts = [{ raw: 'Test', label: 'Test' }];
    
    const eval1 = await Eval.create(testConfig, testPrompts);
    const retrieved = await Eval.findById(eval1.id);
    
    logResult('Basic CRUD operations', 
      retrieved && retrieved.config.description === 'CRUD test',
      retrieved ? 'Create/Read successful' : 'CRUD operations failed',
      !retrieved);
    
    // Test 3: Large data handling
    const largeConfig = {
      description: 'Large data test',
      tests: Array.from({length: 50}, (_, i) => ({
        vars: { data: 'x'.repeat(500), index: i }
      }))
    };
    
    const eval2 = await Eval.create(largeConfig, testPrompts);
    const retrieved2 = await Eval.findById(eval2.id);
    
    logResult('Large data handling',
      retrieved2 && retrieved2.config.tests.length === 50,
      retrieved2 ? `Stored ${retrieved2.config.tests.length} test cases` : 'Large data failed',
      false);
    
    // Test 4: JSON field handling
    const jsonConfig = {
      description: undefined,  // Test undefined handling
      tests: [{ vars: { test: null, data: { nested: 'value' } } }]
    };
    
    try {
      const eval3 = await Eval.create(jsonConfig, testPrompts);
      logResult('JSON field handling', true, 'No JSON parsing errors');
    } catch (error) {
      const isJsonError = error.message.includes('JSON') || error.message.includes('undefined');
      logResult('JSON field handling', false, `Error: ${error.message}`, isJsonError);
    }
    
    // Test 5: Concurrent operations
    const concurrentPromises = [];
    for (let i = 0; i < 10; i++) {
      concurrentPromises.push(
        Eval.create({
          description: `Concurrent ${i}`,
          tests: [{ vars: { n: i } }]
        }, testPrompts)
      );
    }
    
    try {
      const results = await Promise.all(concurrentPromises);
      logResult('Concurrent operations', results.length === 10,
        `Created ${results.length}/10 evals concurrently`);
    } catch (error) {
      const isConcurrencyError = error.message.includes('BUSY') || error.message.includes('locked');
      logResult('Concurrent operations', false, error.message, isConcurrencyError);
    }
    
    closeDb();
    
  } catch (error) {
    logResult('Database operations', false, error.message, true);
  }
}

async function testEvalResults() {
  console.log('\n🔍 Testing Eval Results\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `eval-results-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    const eval1 = await Eval.create({
      description: 'Results test',
      tests: [{ vars: { input: 'test' } }]
    }, [{ raw: 'Test {{input}}', label: 'Test' }]);
    
    // Test adding results
    const evalResult = {
      prompt: { raw: 'Test prompt', label: 'Test' },
      testCase: { vars: { input: 'test' } },
      response: { output: 'test response', raw: 'test response' },
      success: true,
      score: 1.0,
      latencyMs: 100,
      promptIdx: 0,
      testIdx: 0,
      gradingResult: { pass: true, score: 1.0 },
      namedScores: { accuracy: 0.9 },
      metadata: { test: true },
      provider: { id: 'test', label: 'test' },
      failureReason: 0
    };
    
    await eval1.addResult(evalResult);
    
    const resultsCount = await eval1.getResultsCount();
    const tablePage = await eval1.getTablePage({ limit: 10 });
    
    logResult('Eval results operations',
      resultsCount === 1 && tablePage.body.length === 1,
      `Results: ${resultsCount}, Table rows: ${tablePage.body.length}`);
    
    closeDb();
    
  } catch (error) {
    logResult('Eval results testing', false, error.message, true);
  }
}

async function testErrorHandling() {
  console.log('\n🔍 Testing Error Handling\n');
  
  try {
    const { withDbErrorHandling } = require('./dist/src/database/index.js');
    
    // Test error wrapper
    let errorCaught = false;
    try {
      await withDbErrorHandling(async () => {
        const error = new Error('Test error');
        error.code = 'SQLITE_BUSY';
        throw error;
      }, 'test operation');
    } catch (e) {
      errorCaught = true;
    }
    
    logResult('Error handling wrapper', errorCaught, 
      errorCaught ? 'Errors properly handled' : 'Error handling failed');
    
  } catch (error) {
    logResult('Error handling test', false, error.message, false);
  }
}

async function testIntegration() {
  console.log('\n🔍 Testing Integration\n');
  
  try {
    // Test CLI availability
    const { spawn } = require('child_process');
    
    const cliTest = new Promise((resolve) => {
      const proc = spawn('node', ['dist/src/main.js', '--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      let output = '';
      proc.stdout?.on('data', (data) => { output += data; });
      proc.stderr?.on('data', (data) => { output += data; });
      
      proc.on('close', (code) => {
        resolve({ code, output });
      });
      
      proc.on('error', (error) => {
        resolve({ code: -1, error: error.message });
      });
    });
    
    const result = await cliTest;
    logResult('CLI integration', result.code === 0,
      result.code === 0 ? 'CLI accessible' : `CLI failed: ${result.error || result.output}`);
    
  } catch (error) {
    logResult('Integration test', false, error.message, false);
  }
}

async function runComprehensiveTest() {
  console.log('🚀 COMPREHENSIVE LIBSQL MIGRATION TEST');
  console.log('='.repeat(50));
  
  const startTime = Date.now();
  
  await testDatabaseOperations();
  await testEvalResults();
  await testErrorHandling();
  await testIntegration();
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`🚨 Critical: ${testResults.critical}`);
  console.log(`⏱️ Time: ${Math.round(totalTime/1000)}s`);
  
  if (testResults.critical > 0) {
    console.log('\n🚨 CRITICAL ISSUES - NOT PRODUCTION READY');
    process.exit(2);
  } else if (testResults.failed > 0) {
    console.log('\n⚠️ ISSUES FOUND - NEEDS INVESTIGATION');
    process.exit(1);
  } else {
    console.log('\n✅ ALL TESTS PASSED');
    process.exit(0);
  }
}

runComprehensiveTest().catch(error => {
  console.error('💥 Test crashed:', error);
  process.exit(3);
});