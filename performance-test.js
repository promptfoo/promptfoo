#!/usr/bin/env node

/**
 * PERFORMANCE AND LOAD TESTING FOR LIBSQL MIGRATION
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

async function testBasicPerformance() {
  console.log('\n🚀 Testing Basic Performance\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `perf-basic-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    const testConfig = {
      description: 'Performance test',
      tests: [{ vars: { input: 'test' } }]
    };
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Test' }];
    
    // Test 1: Single operation performance
    const start1 = Date.now();
    const eval1 = await Eval.create(testConfig, testPrompts);
    const time1 = Date.now() - start1;
    
    logResult('Single eval creation performance', time1 < 1000, 
      `${time1}ms (should be <1000ms)`, time1 > 2000);
    
    // Test 2: Sequential operations performance
    const start2 = Date.now();
    for (let i = 0; i < 10; i++) {
      await Eval.create({
        description: `Sequential ${i}`,
        tests: [{ vars: { n: i } }]
      }, testPrompts);
    }
    const time2 = Date.now() - start2;
    const avgTime = time2 / 10;
    
    logResult('Sequential operations performance', avgTime < 500,
      `${avgTime.toFixed(1)}ms avg per operation (should be <500ms)`, avgTime > 1000);
    
    // Test 3: Concurrent operations performance
    const start3 = Date.now();
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(Eval.create({
        description: `Concurrent ${i}`,
        tests: [{ vars: { n: i } }]
      }, testPrompts));
    }
    await Promise.all(promises);
    const time3 = Date.now() - start3;
    
    logResult('Concurrent operations performance', time3 < 5000,
      `${time3}ms total (should be <5000ms)`, time3 > 10000);
    
    closeDb();
    
  } catch (error) {
    logResult('Basic performance testing', false, error.message, true);
  }
}

async function testLoadHandling() {
  console.log('\n📊 Testing Load Handling\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `perf-load-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Test' }];
    
    // Test 1: Large dataset handling
    const largeTests = Array.from({length: 100}, (_, i) => ({
      vars: { data: 'x'.repeat(100), index: i }
    }));
    
    const start1 = Date.now();
    const eval1 = await Eval.create({
      description: 'Large dataset test',
      tests: largeTests
    }, testPrompts);
    const time1 = Date.now() - start1;
    
    logResult('Large dataset creation', time1 < 3000,
      `${time1}ms for 100 test cases (should be <3000ms)`, time1 > 5000);
    
    // Test 2: Database size and retrieval
    const start2 = Date.now();
    const retrieved = await Eval.findById(eval1.id);
    const time2 = Date.now() - start2;
    
    logResult('Large dataset retrieval', time2 < 1000 && retrieved.config.tests.length === 100,
      `${time2}ms to retrieve ${retrieved.config.tests.length} test cases`, time2 > 2000);
    
    // Test 3: Multiple large evals
    const start3 = Date.now();
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(Eval.create({
        description: `Bulk ${i}`,
        tests: Array.from({length: 50}, (_, j) => ({ vars: { i, j } }))
      }, testPrompts));
    }
    await Promise.all(promises);
    const time3 = Date.now() - start3;
    
    logResult('Multiple large evals', time3 < 15000,
      `${time3}ms for 5 evals with 50 tests each`, time3 > 30000);
    
    closeDb();
    
  } catch (error) {
    logResult('Load handling testing', false, error.message, true);
  }
}

async function testMemoryUsage() {
  console.log('\n💾 Testing Memory Usage\n');
  
  try {
    const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `perf-memory-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    // Create many evals to test memory usage
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Test' }];
    for (let i = 0; i < 50; i++) {
      await Eval.create({
        description: `Memory test ${i}`,
        tests: Array.from({length: 20}, (_, j) => ({ vars: { i, j, data: 'x'.repeat(50) } }))
      }, testPrompts);
    }
    
    // Force garbage collection if available
    if (global.gc) global.gc();
    
    const endMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    const memoryIncrease = endMemory - startMemory;
    
    logResult('Memory usage', memoryIncrease < 100,
      `${memoryIncrease.toFixed(1)}MB increase (should be <100MB)`, memoryIncrease > 200);
    
    closeDb();
    
  } catch (error) {
    logResult('Memory usage testing', false, error.message, false);
  }
}

async function testDiskUsage() {
  console.log('\n💿 Testing Disk Usage\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `perf-disk-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    const tmpDir = os.tmpdir();
    const dbPath = path.join(tmpDir, `promptfoo-test-${process.env.TEST_DB_ID}.db`);
    
    // Get initial size
    let initialSize = 0;
    try {
      initialSize = fs.statSync(dbPath).size;
    } catch (e) {
      // File might not exist yet
    }
    
    // Create test data
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Test' }];
    for (let i = 0; i < 20; i++) {
      await Eval.create({
        description: `Disk test ${i}`,
        tests: Array.from({length: 25}, (_, j) => ({ 
          vars: { 
            i, j, 
            data: 'x'.repeat(100),
            moreData: { nested: true, value: `test-${i}-${j}` }
          } 
        }))
      }, testPrompts);
    }
    
    closeDb();
    
    const finalSize = fs.statSync(dbPath).size;
    const sizeIncreaseMB = (finalSize - initialSize) / 1024 / 1024;
    
    logResult('Disk usage efficiency', sizeIncreaseMB < 50,
      `${sizeIncreaseMB.toFixed(2)}MB for 500 test cases (should be <50MB)`, sizeIncreaseMB > 100);
    
    // Test compression effectiveness by checking if database is reasonable size
    const avgBytesPerTest = (finalSize - initialSize) / 500;
    logResult('Data compression', avgBytesPerTest < 50000,
      `${avgBytesPerTest.toFixed(0)} bytes per test case (should be <50KB)`, avgBytesPerTest > 100000);
    
  } catch (error) {
    logResult('Disk usage testing', false, error.message, false);
  }
}

async function runPerformanceTests() {
  console.log('🚀 LIBSQL PERFORMANCE AND LOAD TESTS');
  console.log('='.repeat(50));
  
  const startTime = Date.now();
  
  await testBasicPerformance();
  await testLoadHandling();
  await testMemoryUsage();
  await testDiskUsage();
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 PERFORMANCE TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`🚨 Critical: ${testResults.critical}`);
  console.log(`⏱️ Time: ${Math.round(totalTime/1000)}s`);
  
  if (testResults.critical > 0) {
    console.log('\n🚨 CRITICAL PERFORMANCE ISSUES - NOT PRODUCTION READY');
    process.exit(2);
  } else if (testResults.failed > 0) {
    console.log('\n⚠️ PERFORMANCE ISSUES - NEEDS OPTIMIZATION');
    process.exit(1);
  } else {
    console.log('\n✅ ALL PERFORMANCE TESTS PASSED');
    process.exit(0);
  }
}

runPerformanceTests().catch(error => {
  console.error('💥 Performance test crashed:', error);
  process.exit(3);
});