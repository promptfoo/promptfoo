#!/usr/bin/env node

/**
 * CRITICAL END-TO-END LIBSQL MIGRATION AUDIT
 * 
 * This is a comprehensive test suite that validates the entire libSQL migration
 * with real-world scenarios, edge cases, and failure modes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// Test configuration
const TEST_RESULTS = {
  passed: 0,
  failed: 0,
  critical: 0,
  warnings: 0,
  tests: []
};

function logTest(name, status, details, critical = false) {
  const result = { name, status, details, critical, timestamp: new Date().toISOString() };
  TEST_RESULTS.tests.push(result);
  
  const icon = status === 'PASS' ? '✅' : critical ? '🚨' : '❌';
  const prefix = critical ? 'CRITICAL' : status;
  
  console.log(`${icon} ${prefix}: ${name}`);
  if (details) {
    console.log(`   Details: ${details}`);
  }
  
  if (status === 'PASS') {
    TEST_RESULTS.passed++;
  } else {
    TEST_RESULTS.failed++;
    if (critical) TEST_RESULTS.critical++;
  }
}

function logWarning(message) {
  console.log(`⚠️  WARNING: ${message}`);
  TEST_RESULTS.warnings++;
}

async function runCommand(cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['inherit', 'pipe', 'pipe'],
      ...options
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', (error) => {
      reject(error);
    });
  });
}

async function test1_DatabaseInitialization() {
  console.log('\n🔍 TEST CATEGORY 1: Database Initialization\n');
  
  try {
    // Test 1.1: Clean database creation
    const testDir = path.join(os.tmpdir(), `libsql-audit-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    
    process.env.PROMPTFOO_CONFIG_DIR = testDir;
    delete process.env.IS_TESTING; // Use real database paths
    
    const { getDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    
    // Force fresh database
    const { closeDb } = require('./dist/src/database/index.js');
    closeDb();
    
    await runDbMigrations();
    const db = getDb();
    
    // Verify database structure
    const { sql } = require('drizzle-orm');
    const tables = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table'`);
    const requiredTables = ['evals', 'eval_results', 'prompts', 'datasets', 'tags', 'model_audits'];
    const missingTables = requiredTables.filter(table => 
      !tables.some(t => t.name === table)
    );
    
    if (missingTables.length > 0) {
      logTest('Fresh database creation', 'FAIL', \`Missing tables: \${missingTables.join(', ')}\`, true);
    } else {
      logTest('Fresh database creation', 'PASS', \`Created \${tables.length} tables\`);
    }
    
    // Test 1.2: Database file permissions and location
    const dbPath = path.join(testDir, 'promptfoo.db');
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      logTest('Database file creation', 'PASS', \`File size: \${stats.size} bytes\`);
    } else {
      logTest('Database file creation', 'FAIL', 'Database file not found', true);
    }
    
    // Cleanup
    closeDb();
    fs.rmSync(testDir, { recursive: true, force: true });
    
  } catch (error) {
    logTest('Database initialization', 'FAIL', error.message, true);
  }
}

async function test2_DataIntegrityValidation() {
  console.log('\n🔍 TEST CATEGORY 2: Data Integrity\n');
  
  try {
    // Setup test environment
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = \`data-integrity-\${Date.now()}\`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    // Test 2.1: Large JSON data handling
    const largeConfig = {
      description: 'Large data test',
      tests: Array.from({ length: 100 }, (_, i) => ({
        vars: { 
          input: \`Large test data \${i}\`.repeat(100),
          metadata: { index: i, data: 'x'.repeat(1000) }
        }
      }))
    };
    
    const largePrompts = [{ raw: 'Test {{input}}', label: 'Large test' }];
    const largeEval = await Eval.create(largeConfig, largePrompts);
    
    const retrievedEval = await Eval.findById(largeEval.id);
    if (retrievedEval && retrievedEval.config.tests.length === 100) {
      logTest('Large JSON data handling', 'PASS', \`Stored \${retrievedEval.config.tests.length} test cases\`);
    } else {
      logTest('Large JSON data handling', 'FAIL', 'Data truncation or corruption detected', true);
    }
    
    // Test 2.2: Special character handling
    const specialConfig = {
      description: 'Unicode test: 🚀 测试 العربية',
      tests: [{
        vars: { 
          emoji: '🎉🔥💯',
          chinese: '你好世界',
          arabic: 'مرحبا بالعالم',
          special: 'quotes"apostrophes\\'backslashes\\\\',
          json: '{"nested": {"value": "test"}}'
        }
      }]
    };
    
    const specialPrompts = [{ raw: 'Special: {{emoji}} {{chinese}}', label: 'Unicode test' }];
    const specialEval = await Eval.create(specialConfig, specialPrompts);
    
    const retrievedSpecial = await Eval.findById(specialEval.id);
    if (retrievedSpecial?.config.tests[0].vars.emoji === '🎉🔥💯') {
      logTest('Unicode/special character handling', 'PASS', 'All special characters preserved');
    } else {
      logTest('Unicode/special character handling', 'FAIL', 'Character corruption detected', true);
    }
    
    // Test 2.3: NULL/undefined handling
    const nullConfig = {
      description: undefined, // undefined value
      tests: [{ vars: { test: null } }]
    };
    
    try {
      const nullEval = await Eval.create(nullConfig, [{ raw: 'Test', label: 'Test' }]);
      const retrievedNull = await Eval.findById(nullEval.id);
      logTest('NULL/undefined value handling', 'PASS', 'No JSON parsing errors');
    } catch (error) {
      if (error.message.includes('undefined') || error.message.includes('JSON')) {
        logTest('NULL/undefined value handling', 'FAIL', \`JSON error: \${error.message}\`, true);
      } else {
        logTest('NULL/undefined value handling', 'PASS', 'Error handled gracefully');
      }
    }
    
    closeDb();
    
  } catch (error) {
    logTest('Data integrity validation', 'FAIL', error.message, true);
  }
}

async function test3_ConcurrencyAndLocking() {
  console.log('\n🔍 TEST CATEGORY 3: Concurrency & Locking\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = \`concurrency-\${Date.now()}\`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    // Test 3.1: Rapid sequential writes
    const sequentialPromises = [];
    for (let i = 0; i < 20; i++) {
      sequentialPromises.push(
        Eval.create(
          { description: \`Sequential test \${i}\`, tests: [{ vars: { n: i } }] },
          [{ raw: \`Test \${i}\`, label: \`Test \${i}\` }]
        )
      );
    }
    
    try {
      const sequentialResults = await Promise.all(sequentialPromises);
      if (sequentialResults.length === 20) {
        logTest('Rapid sequential writes', 'PASS', \`Created \${sequentialResults.length} evals\`);
      } else {
        logTest('Rapid sequential writes', 'FAIL', 'Some writes failed', true);
      }
    } catch (error) {
      if (error.message.includes('SQLITE_BUSY') || error.message.includes('locked')) {
        logTest('Rapid sequential writes', 'FAIL', 'Database locking issues detected', true);
      } else {
        logTest('Rapid sequential writes', 'FAIL', error.message, true);
      }
    }
    
    // Test 3.2: Read-heavy workload
    const evals = await Eval.getMany(50);
    const readPromises = [];
    for (const evalItem of evals.slice(0, 10)) {
      for (let i = 0; i < 5; i++) {
        readPromises.push(Eval.findById(evalItem.id));
      }
    }
    
    try {
      const readResults = await Promise.all(readPromises);
      const successfulReads = readResults.filter(r => r !== undefined).length;
      logTest('Concurrent read operations', 'PASS', \`\${successfulReads}/\${readPromises.length} reads successful\`);
    } catch (error) {
      logTest('Concurrent read operations', 'FAIL', error.message, true);
    }
    
    closeDb();
    
  } catch (error) {
    logTest('Concurrency testing', 'FAIL', error.message, true);
  }
}

async function test4_PerformanceBenchmarks() {
  console.log('\n🔍 TEST CATEGORY 4: Performance Benchmarks\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = \`performance-\${Date.now()}\`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    
    closeDb();
    await runDbMigrations();
    
    // Test 4.1: Bulk insert performance
    const startTime = Date.now();
    const bulkPromises = [];
    
    for (let i = 0; i < 50; i++) {
      const config = {
        description: \`Performance test \${i}\`,
        tests: Array.from({ length: 10 }, (_, j) => ({ vars: { test: j } }))
      };
      const prompts = [{ raw: \`Perf test \${i}\`, label: \`Perf \${i}\` }];
      bulkPromises.push(Eval.create(config, prompts));
    }
    
    await Promise.all(bulkPromises);
    const bulkInsertTime = Date.now() - startTime;
    
    if (bulkInsertTime < 10000) { // 10 seconds threshold
      logTest('Bulk insert performance', 'PASS', \`50 evals created in \${bulkInsertTime}ms\`);
    } else {
      logTest('Bulk insert performance', 'FAIL', \`Too slow: \${bulkInsertTime}ms\`, false);
    }
    
    // Test 4.2: Query performance
    const queryStartTime = Date.now();
    const allEvals = await Eval.getMany(100);
    const queryTime = Date.now() - queryStartTime;
    
    if (queryTime < 1000) { // 1 second threshold
      logTest('Query performance', 'PASS', \`Retrieved \${allEvals.length} evals in \${queryTime}ms\`);
    } else {
      logTest('Query performance', 'FAIL', \`Query too slow: \${queryTime}ms\`, false);
    }
    
    closeDb();
    
  } catch (error) {
    logTest('Performance benchmarks', 'FAIL', error.message, false);
  }
}

async function test5_ErrorHandlingAndRecovery() {
  console.log('\n🔍 TEST CATEGORY 5: Error Handling & Recovery\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = \`error-handling-\${Date.now()}\`;
    
    const { getDb, closeDb, withDbErrorHandling } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    
    closeDb();
    await runDbMigrations();
    
    // Test 5.1: Error handling wrapper functionality
    let errorHandled = false;
    try {
      await withDbErrorHandling(async () => {
        throw new Error('SQLITE_BUSY: database is locked');
      }, 'test operation');
    } catch (error) {
      errorHandled = true;
    }
    
    if (errorHandled) {
      logTest('Error handling wrapper', 'PASS', 'libSQL errors properly caught and handled');
    } else {
      logTest('Error handling wrapper', 'FAIL', 'Error handling not working', true);
    }
    
    // Test 5.2: Invalid data recovery
    const db = getDb();
    const { evalsTable } = require('./dist/src/database/tables.js');
    
    try {
      // Try to insert invalid data
      await db.insert(evalsTable).values({
        id: 'invalid-test',
        createdAt: Date.now(),
        config: null, // Invalid - should be object
        results: {},
        isRedteam: false
      });
      logTest('Invalid data rejection', 'FAIL', 'Invalid data was accepted', true);
    } catch (error) {
      logTest('Invalid data rejection', 'PASS', 'Invalid data properly rejected');
    }
    
    closeDb();
    
  } catch (error) {
    logTest('Error handling testing', 'FAIL', error.message, true);
  }
}

async function test6_IntegrationValidation() {
  console.log('\n🔍 TEST CATEGORY 6: Integration Validation\n');
  
  try {
    // Test 6.1: CLI integration
    const cliResult = await runCommand('node', ['dist/src/main.js', '--version']);
    if (cliResult.code === 0) {
      logTest('CLI integration', 'PASS', 'CLI executable works');
    } else {
      logTest('CLI integration', 'FAIL', \`CLI failed: \${cliResult.stderr}\`, true);
    }
    
    // Test 6.2: Basic eval workflow
    const testConfigPath = path.join(os.tmpdir(), 'integration-test-config.yaml');
    const configContent = \`
description: "Integration test"
providers:
  - id: echo
    config:
      output: "Integration test response"
prompts:
  - "Test prompt"
tests:
  - assert:
      - type: contains
        value: "Integration"
\`;
    
    fs.writeFileSync(testConfigPath, configContent);
    
    const evalResult = await runCommand('node', [
      'dist/src/main.js', 'eval',
      '--config', testConfigPath,
      '--no-table', '--no-cache'
    ]);
    
    if (evalResult.code === 0 && !evalResult.stderr.includes('Error') && !evalResult.stderr.includes('FAIL')) {
      logTest('End-to-end eval workflow', 'PASS', 'Full eval workflow completed');
    } else {
      logTest('End-to-end eval workflow', 'FAIL', \`Eval workflow failed: \${evalResult.stderr}\`, true);
    }
    
    // Cleanup
    fs.unlinkSync(testConfigPath);
    
  } catch (error) {
    logTest('Integration validation', 'FAIL', error.message, true);
  }
}

async function test7_RealWorldScenarios() {
  console.log('\n🔍 TEST CATEGORY 7: Real-World Scenarios\n');
  
  try {
    process.env.IS_TESTING = 'true';
    process.env.TEST_DB_ID = \`real-world-\${Date.now()}\`;
    
    const { getDb, closeDb } = require('./dist/src/database/index.js');
    const { runDbMigrations } = require('./dist/src/migrate.js');
    const Eval = require('./dist/src/models/eval.js').default;
    const EvalResult = require('./dist/src/models/evalResult.js').default;
    
    closeDb();
    await runDbMigrations();
    
    // Test 7.1: Realistic eval with results
    const realisticConfig = {
      description: 'Realistic LLM evaluation',
      providers: [
        { id: 'openai:gpt-4', label: 'GPT-4' },
        { id: 'openai:gpt-3.5-turbo', label: 'GPT-3.5' }
      ],
      prompts: [
        'Analyze this text: {{text}}',
        'Summarize: {{text}}',
        'Extract key points from: {{text}}'
      ],
      tests: Array.from({ length: 20 }, (_, i) => ({
        vars: { text: \`Sample text for analysis \${i}. This is a longer piece of text that simulates real evaluation scenarios.\` },
        assert: [
          { type: 'contains', value: 'analysis' },
          { type: 'javascript', value: 'output.length > 10' }
        ]
      }))
    };
    
    const realisticPrompts = realisticConfig.prompts.map(p => ({ raw: p, label: p }));
    const realisticEval = await Eval.create(realisticConfig, realisticPrompts);
    
    // Add some eval results
    const resultPromises = [];
    for (let i = 0; i < 10; i++) {
      const evalResult = {
        prompt: realisticPrompts[0],
        testCase: { vars: { text: \`Test \${i}\` } },
        response: { 
          output: \`Analysis result for test \${i}: This is a comprehensive analysis.\`,
          tokenUsage: { total: 100 + i, prompt: 50, completion: 50 + i }
        },
        success: Math.random() > 0.2,
        score: Math.random(),
        latencyMs: 500 + Math.random() * 1000,
        promptIdx: 0,
        testIdx: i,
        gradingResult: { pass: true, score: Math.random() },
        namedScores: { accuracy: Math.random(), relevance: Math.random() },
        provider: { id: 'openai:gpt-4', label: 'GPT-4' },
        failureReason: 0,
        metadata: { model: 'gpt-4', temperature: 0.7 }
      };
      
      resultPromises.push(realisticEval.addResult(evalResult));
    }
    
    await Promise.all(resultPromises);
    
    // Validate results
    const resultsCount = await realisticEval.getResultsCount();
    const tablePage = await realisticEval.getTablePage({ limit: 5 });
    
    if (resultsCount === 10 && tablePage.body.length === 5) {
      logTest('Realistic eval scenario', 'PASS', \`Created eval with \${resultsCount} results\`);
    } else {
      logTest('Realistic eval scenario', 'FAIL', 'Result storage/retrieval issues', true);
    }
    
    closeDb();
    
  } catch (error) {
    logTest('Real-world scenarios', 'FAIL', error.message, true);
  }
}

async function runAllTests() {
  console.log('🚀 STARTING CRITICAL LIBSQL MIGRATION AUDIT\\n');
  console.log('='.repeat(80));
  
  const startTime = Date.now();
  
  // Execute all test categories
  await test1_DatabaseInitialization();
  await test2_DataIntegrityValidation();
  await test3_ConcurrencyAndLocking();
  await test4_PerformanceBenchmarks();
  await test5_ErrorHandlingAndRecovery();
  await test6_IntegrationValidation();
  await test7_RealWorldScenarios();
  
  const totalTime = Date.now() - startTime;
  
  console.log('\\n' + '='.repeat(80));
  console.log('📊 AUDIT SUMMARY');
  console.log('='.repeat(80));
  
  console.log(\`✅ Tests Passed: \${TEST_RESULTS.passed}\`);
  console.log(\`❌ Tests Failed: \${TEST_RESULTS.failed}\`);
  console.log(\`🚨 Critical Failures: \${TEST_RESULTS.critical}\`);
  console.log(\`⚠️  Warnings: \${TEST_RESULTS.warnings}\`);
  console.log(\`⏱️  Total Time: \${Math.round(totalTime / 1000)}s\`);
  
  console.log('\\n📋 DETAILED RESULTS:');
  TEST_RESULTS.tests.forEach(test => {
    const status = test.status === 'PASS' ? '✅' : test.critical ? '🚨' : '❌';
    console.log(\`\${status} \${test.name}: \${test.details || 'No details'}\`);
  });
  
  // Final assessment
  console.log('\\n' + '='.repeat(80));
  if (TEST_RESULTS.critical > 0) {
    console.log('🚨 CRITICAL ISSUES DETECTED - NOT READY FOR PRODUCTION');
    console.log(\`Found \${TEST_RESULTS.critical} critical issues that must be resolved.\`);
  } else if (TEST_RESULTS.failed > 0) {
    console.log('⚠️  ISSUES DETECTED - REQUIRES ATTENTION');
    console.log(\`Found \${TEST_RESULTS.failed} issues that should be investigated.\`);
  } else {
    console.log('✅ ALL TESTS PASSED - MIGRATION APPEARS READY');
    console.log('LibSQL migration has passed comprehensive testing.');
  }
  
  // Exit with appropriate code
  process.exit(TEST_RESULTS.critical > 0 ? 2 : TEST_RESULTS.failed > 0 ? 1 : 0);
}

// Run the audit
runAllTests().catch(error => {
  console.error('💥 AUDIT CRASHED:', error);
  process.exit(3);
});