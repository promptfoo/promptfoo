#!/usr/bin/env node

/**
 * FAILURE SCENARIO TESTING FOR LIBSQL MIGRATION
 * 
 * Tests error handling, recovery scenarios, and edge cases
 * to ensure the migration is robust in production environments
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

async function testDatabaseConnectionFailures() {
  console.log('\n💥 Testing Database Connection Failures\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `failure-conn-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    
    // Test: Force close and reopen database
    try {
      closeDb();
      await runDbMigrations();
      const db = getDb();
      
      // Test basic operation after forced reconnection
      const { sql } = require('drizzle-orm');
      const tables = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' LIMIT 1`);
      
      logResult('Database reconnection handling', tables.length > 0, 
        'Database reconnected successfully after forced close');
      closeDb();
    } catch (error) {
      logResult('Database reconnection handling', false, 
        `Failed to reconnect: ${error.message}`, true);
    }
    
  } catch (error) {
    logResult('Database connection failure testing', false, error.message, true);
  }
}

async function testMalformedDataHandling() {
  console.log('\n🗂️ Testing Malformed Data Handling\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `failure-data-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Test' }];
    
    // Test 1: Extremely large data
    try {
      const largeData = 'x'.repeat(10000000); // 10MB string
      const config1 = {
        description: 'Large data test',
        tests: [{ vars: { large: largeData } }]
      };
      
      const eval1 = await Eval.create(config1, testPrompts);
      const retrieved1 = await Eval.findById(eval1.id);
      
      logResult('Extremely large data handling', 
        retrieved1 && retrieved1.config.tests[0].vars.large.length === largeData.length,
        'Large data stored and retrieved successfully');
        
    } catch (error) {
      const isExpectedFailure = error.message.includes('too large') || 
                              error.message.includes('limit') ||
                              error.message.includes('memory');
      logResult('Extremely large data handling', isExpectedFailure,
        `Expected failure with large data: ${error.message}`, !isExpectedFailure);
    }
    
    // Test 2: Circular references in data
    try {
      const circularObj = { name: 'test' };
      circularObj.self = circularObj; // Create circular reference
      
      const config2 = {
        description: 'Circular reference test',
        tests: [{ vars: { circular: circularObj } }]
      };
      
      const eval2 = await Eval.create(config2, testPrompts);
      
      // This should either work (if circular refs are handled) or fail gracefully
      logResult('Circular reference handling', true, 'Circular references handled gracefully');
      
    } catch (error) {
      const isGracefulFailure = error.message.includes('circular') ||
                              error.message.includes('Converting') ||
                              error.message.includes('JSON');
      logResult('Circular reference handling', isGracefulFailure,
        `Graceful failure: ${error.message}`, !isGracefulFailure);
    }
    
    // Test 3: Invalid UTF-8 and special characters
    try {
      const specialChars = '🚀🎉💥🔥💻🌟⭐️✅❌🚨📊🔍🆕📊↩️';
      const unicodeText = 'Test with émojis and spëcial charactërs: αβγδε 中文 العربية';
      
      const config3 = {
        description: 'Special characters test',
        tests: [{ 
          vars: { 
            emojis: specialChars,
            unicode: unicodeText,
            binary: Buffer.from('binary data', 'utf8').toString('base64')
          } 
        }]
      };
      
      const eval3 = await Eval.create(config3, testPrompts);
      const retrieved3 = await Eval.findById(eval3.id);
      
      const isDataIntact = retrieved3 && 
        retrieved3.config.tests[0].vars.emojis === specialChars &&
        retrieved3.config.tests[0].vars.unicode === unicodeText;
      
      logResult('Special character handling', isDataIntact,
        'Unicode and special characters preserved correctly');
        
    } catch (error) {
      logResult('Special character handling', false, 
        `Failed to handle special characters: ${error.message}`, true);
    }
    
    closeDb();
    
  } catch (error) {
    logResult('Malformed data handling', false, error.message, true);
  }
}

async function testErrorRecovery() {
  console.log('\n🔄 Testing Error Recovery\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `failure-recovery-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Test' }];
    
    // Test 1: Recovery from failed operations
    let recoveryWorked = false;
    try {
      // First, create a valid eval
      const config1 = {
        description: 'Recovery test',
        tests: [{ vars: { input: 'test' } }]
      };
      
      const eval1 = await Eval.create(config1, testPrompts);
      
      // Now try to force an error and then recover
      try {
        // This should cause an error (trying to create duplicate or invalid data)
        const invalidConfig = {
          description: null, // Force potential issues
          tests: undefined
        };
        
        await Eval.create(invalidConfig, testPrompts);
      } catch (expectedError) {
        // Error is expected, now test if system recovers
      }
      
      // Try to create another valid eval after the error
      const config2 = {
        description: 'Post-error test',
        tests: [{ vars: { input: 'post-error' } }]
      };
      
      const eval2 = await Eval.create(config2, testPrompts);
      const retrieved = await Eval.findById(eval2.id);
      
      recoveryWorked = retrieved && retrieved.config.description === 'Post-error test';
      
    } catch (recoveryError) {
      recoveryWorked = false;
    }
    
    logResult('Error recovery', recoveryWorked,
      recoveryWorked ? 'System recovered after errors' : 'System did not recover properly',
      !recoveryWorked);
    
    // Test 2: Database connection recovery
    let connectionRecoveryWorked = false;
    try {
      // Force close the database
      closeDb();
      
      // Try to use it (should fail or auto-reconnect)
      const config3 = {
        description: 'Connection recovery test',
        tests: [{ vars: { input: 'reconnect' } }]
      };
      
      const eval3 = await Eval.create(config3, testPrompts);
      connectionRecoveryWorked = true;
      
    } catch (connectionError) {
      // If it failed, try to re-establish connection manually
      try {
        await runDbMigrations();
        const config3 = {
          description: 'Connection recovery test',
          tests: [{ vars: { input: 'reconnect' } }]
        };
        
        const eval3 = await Eval.create(config3, testPrompts);
        connectionRecoveryWorked = true;
      } catch (stillFailedError) {
        connectionRecoveryWorked = false;
      }
    }
    
    logResult('Connection recovery', connectionRecoveryWorked,
      connectionRecoveryWorked ? 'Database connection recovered' : 'Connection recovery failed');
    
    closeDb();
    
  } catch (error) {
    logResult('Error recovery testing', false, error.message, false);
  }
}

async function testEdgeCasesAndLimits() {
  console.log('\n🎯 Testing Edge Cases and Limits\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = `failure-edge-${Date.now()}`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    const testPrompts = [{ raw: 'Test {{input}}', label: 'Test' }];
    
    // Test 1: Empty and minimal data
    try {
      const configs = [
        { description: '', tests: [] }, // Empty
        { description: 'a', tests: [{ vars: {} }] }, // Minimal
        { tests: [{ vars: { a: 1 } }] }, // Missing description
      ];
      
      let emptyDataHandled = true;
      for (const config of configs) {
        try {
          const eval1 = await Eval.create(config, testPrompts);
          const retrieved = await Eval.findById(eval1.id);
          if (!retrieved) emptyDataHandled = false;
        } catch (error) {
          // Some empty data failures might be expected
          if (!error.message.includes('required') && !error.message.includes('empty')) {
            emptyDataHandled = false;
          }
        }
      }
      
      logResult('Empty data handling', emptyDataHandled,
        'Empty and minimal data handled appropriately');
        
    } catch (error) {
      logResult('Empty data handling', false, error.message, false);
    }
    
    // Test 2: Deeply nested data structures
    try {
      const deepObject = {};
      let current = deepObject;
      for (let i = 0; i < 50; i++) {
        current.nested = { level: i };
        current = current.nested;
      }
      
      const config = {
        description: 'Deep nesting test',
        tests: [{ vars: { deep: deepObject } }]
      };
      
      const eval1 = await Eval.create(config, testPrompts);
      const retrieved = await Eval.findById(eval1.id);
      
      logResult('Deep nesting handling', retrieved !== null,
        'Deeply nested structures handled');
        
    } catch (error) {
      const isExpectedFailure = error.message.includes('depth') || 
                              error.message.includes('nest') ||
                              error.message.includes('stack');
      logResult('Deep nesting handling', isExpectedFailure,
        `Expected failure with deep nesting: ${error.message}`, !isExpectedFailure);
    }
    
    // Test 3: Many simultaneous operations with potential failures
    try {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        // Mix valid and potentially problematic operations
        const config = {
          description: i % 5 === 0 ? null : `Batch test ${i}`, // Some null descriptions
          tests: i % 3 === 0 ? [] : [{ vars: { i } }] // Some empty tests
        };
        
        promises.push(
          Eval.create(config, testPrompts).catch(error => ({ error: error.message }))
        );
      }
      
      const results = await Promise.all(promises);
      const successful = results.filter(r => !r.error && r.id).length;
      const failed = results.filter(r => r.error).length;
      
      logResult('Batch operations with failures', successful > 0,
        `${successful} succeeded, ${failed} failed gracefully out of 20 operations`,
        successful === 0);
        
    } catch (error) {
      logResult('Batch operations with failures', false, error.message, true);
    }
    
    closeDb();
    
  } catch (error) {
    logResult('Edge cases and limits testing', false, error.message, false);
  }
}

async function runFailureScenarioTests() {
  console.log('🚀 LIBSQL FAILURE SCENARIO TESTS');
  console.log('='.repeat(50));
  
  const startTime = Date.now();
  
  await testDatabaseConnectionFailures();
  await testMalformedDataHandling();
  await testErrorRecovery();
  await testEdgeCasesAndLimits();
  
  const totalTime = Date.now() - startTime;
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 FAILURE SCENARIO TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`🚨 Critical: ${testResults.critical}`);
  console.log(`⏱️ Time: ${Math.round(totalTime/1000)}s`);
  
  if (testResults.critical > 0) {
    console.log('\n🚨 CRITICAL FAILURE HANDLING ISSUES - NOT PRODUCTION READY');
    process.exit(2);
  } else if (testResults.failed > 0) {
    console.log('\n⚠️ FAILURE HANDLING ISSUES - NEEDS REVIEW');
    process.exit(1);
  } else {
    console.log('\n✅ ALL FAILURE SCENARIO TESTS PASSED');
    process.exit(0);
  }
}

runFailureScenarioTests().catch(error => {
  console.error('💥 Failure scenario test crashed:', error);
  process.exit(3);
});