import * as pythonUtils from '../../src/python/pythonUtils';

async function aggressiveRaceConditionTest() {
  const { state } = pythonUtils;
  console.log('=== AGGRESSIVE RACE CONDITION TEST ===');
  console.log('Testing the REAL validatePythonPath function with race condition fix');
  let totalTests = 0;
  let totalFailures = 0;
  let raceConditionsDetected = 0;
  let inconsistentResults = 0;
  // Test 1: Simultaneous cache misses
  console.log('\n--- Test 1: Simultaneous Cache Miss Race ---');
  for (let round = 1; round <= 3; round++) {
    console.log(`\n=== Round ${round} ===`);
    // Force cache miss
    state.cachedPythonPath = null;
    const promises = [];
    const startTime = Date.now();
    // Launch 10 simultaneous validations using the REAL function
    for (let i = 1; i <= 10; i++) {
      promises.push(
        (async (testId) => {
          try {
            console.log(`[Test ${testId}] Starting concurrent validation`);
            const result = await pythonUtils.validatePythonPath('python', false);
            const duration = Date.now() - startTime;
            console.log(`[Test ${testId}] SUCCESS: ${result} (${duration}ms)`);
            return { testId, success: true, result, duration };
          } catch (error: unknown) {
            const duration = Date.now() - startTime;
            console.log(
              `[Test ${testId}] FAILED: ${error instanceof Error ? error.message : String(error)} (${duration}ms)`,
            );
            return {
              testId,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              duration,
            };
          }
        })(i),
      );
    }
    const results = await Promise.all(promises);
    const failures = results.filter((r) => !r.success);
    const successes = results.filter((r) => r.success);
    console.log(`\nRound ${round} Summary:`);
    console.log(`Results: ${successes.length}/${results.length} succeeded`);
    console.log(`Final cached path: ${state.cachedPythonPath}`);
    // Check for different results (race condition indicator)
    const uniqueResults = new Set(successes.map((r) => r.result));
    if (uniqueResults.size > 1) {
      console.log(
        `🚨 RACE CONDITION DETECTED! Different results: ${Array.from(uniqueResults).join(', ')}`,
      );
      raceConditionsDetected++;
      inconsistentResults++;
    } else if (successes.length > 0) {
      console.log(`✅ CONSISTENT RESULTS: All successful calls returned: ${successes[0].result}`);
    }
    if (failures.length > 0) {
      console.log(`⚠️  MIXED RESULTS: ${failures.length} failed, ${successes.length} succeeded`);
      console.log(`Failures: ${failures.map((f) => `Test ${f.testId}: ${f.error}`).join('; ')}`);
    }
    totalTests += results.length;
    totalFailures += failures.length;
  }
  // Test 2: Mixed explicit/implicit calls
  console.log('\n--- Test 2: Mixed Explicit/Implicit Validation ---');
  for (let round = 1; round <= 2; round++) {
    console.log(`\nStarting mixed test round ${round}`);
    state.cachedPythonPath = null;
    const mixedPromises = [];
    for (let i = 0; i < 8; i++) {
      const isExplicit = i % 2 === 0;
      const pythonPath = 'python';
      mixedPromises.push(
        (async (testId) => {
          try {
            const result = await pythonUtils.validatePythonPath(pythonPath, isExplicit);
            console.log(
              `[Mixed ${testId}] SUCCESS: ${result} (${isExplicit ? 'explicit' : 'implicit'})`,
            );
            return { testId, success: true, result, isExplicit };
          } catch (error: unknown) {
            console.log(
              `[Mixed ${testId}] FAILED: ${error instanceof Error ? error.message : String(error)} (${isExplicit ? 'explicit' : 'implicit'})`,
            );
            return {
              testId,
              success: false,
              error: error instanceof Error ? error.message : String(error),
              isExplicit,
            };
          }
        })(i),
      );
    }
    const mixedResults = await Promise.all(mixedPromises);
    const mixedFailures = mixedResults.filter((r) => !r.success);
    const mixedSuccesses = mixedResults.filter((r) => r.success);
    console.log(`\nMixed test results: ${mixedSuccesses.length}/${mixedResults.length} succeeded`);
    console.log(`Final cached path: ${state.cachedPythonPath}`);
    // Check for inconsistent results
    const explicitResults = mixedSuccesses.filter((r) => r.isExplicit).map((r) => r.result);
    const implicitResults = mixedSuccesses.filter((r) => !r.isExplicit).map((r) => r.result);
    if (explicitResults.length > 0 && implicitResults.length > 0) {
      const uniqueExplicit = new Set(explicitResults);
      const uniqueImplicit = new Set(implicitResults);
      if (uniqueExplicit.size > 1 || uniqueImplicit.size > 1) {
        console.log(`🚨 INCONSISTENT RESULTS for mixed calls`);
        console.log(`Explicit results: ${Array.from(uniqueExplicit).join(', ')}`);
        console.log(`Implicit results: ${Array.from(uniqueImplicit).join(', ')}`);
        inconsistentResults++;
        raceConditionsDetected++;
      } else {
        console.log(`✅ CONSISTENT RESULTS:`);
        console.log(`Explicit results: ${Array.from(uniqueExplicit).join(', ')}`);
        console.log(`Implicit results: ${Array.from(uniqueImplicit).join(', ')}`);
      }
    }
    totalTests += mixedResults.length;
    totalFailures += mixedFailures.length;
  }
  // Test 3: Rapid successive calls
  console.log('\n--- Test 3: Rapid Successive Calls ---');
  state.cachedPythonPath = null;
  const rapidPromises = [];
  for (let i = 0; i < 20; i++) {
    rapidPromises.push(
      (async (testId) => {
        try {
          const result = await pythonUtils.validatePythonPath('python', false);
          console.log(`[Rapid ${testId}] SUCCESS: ${result}`);
          return { testId, success: true, result };
        } catch (error: unknown) {
          console.log(
            `[Rapid ${testId}] FAILED: ${error instanceof Error ? error.message : String(error)}`,
          );
          return {
            testId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })(i),
    );
  }
  const rapidResults = await Promise.all(rapidPromises);
  const rapidFailures = rapidResults.filter((r) => !r.success);
  const rapidSuccesses = rapidResults.filter((r) => r.success);
  console.log(`\nRapid test results: ${rapidSuccesses.length}/${rapidResults.length} succeeded`);
  const rapidPaths = new Set(rapidSuccesses.map((r) => r.result));
  if (rapidPaths.size > 1) {
    console.log(`🚨 INCONSISTENT RESULTS! Different paths: ${Array.from(rapidPaths).join(', ')}`);
    raceConditionsDetected++;
    inconsistentResults++;
  } else if (rapidSuccesses.length > 0) {
    console.log(`✅ CONSISTENT RESULTS: All calls returned: ${rapidSuccesses[0].result}`);
  }
  totalTests += rapidResults.length;
  totalFailures += rapidFailures.length;
  // Final summary
  console.log('\n=== AGGRESSIVE RACE CONDITION TEST SUMMARY ===');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Total failures: ${totalFailures}`);
  console.log(`Failure rate: ${((totalFailures / totalTests) * 100).toFixed(2)}%`);
  console.log(`Race conditions detected: ${raceConditionsDetected}`);
  console.log(`Inconsistent results: ${inconsistentResults}`);
  if (raceConditionsDetected > 0) {
    console.log('\n❌ RACE CONDITIONS STILL DETECTED!');
    console.log('The fix may not be working properly or needs improvement.');
    console.log('Key indicators:');
    console.log('- Different concurrent calls returned different Python paths');
    console.log('- Inconsistent results across multiple runs');
  } else if (totalFailures > 0) {
    console.log('\n⚠️  SOME FAILURES DETECTED');
    console.log('No race conditions found, but some validation failures occurred.');
    console.log('This could be due to system-specific Python installation issues.');
  } else {
    console.log('\n🎯 SUCCESS! NO RACE CONDITIONS DETECTED!');
    console.log('The fix appears to be working correctly.');
    console.log('Key indicators:');
    console.log('- All concurrent calls returned consistent results');
    console.log('- No cache corruption detected');
    console.log('- Validation synchronization working properly');
  }
}
// Run the test
aggressiveRaceConditionTest().catch(console.error);
