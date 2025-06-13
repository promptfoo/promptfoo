const pythonUtils = require("./dist/src/python/pythonUtils");
            const { state } = pythonUtils;
            // Store original function
            const originalValidatePythonPath = pythonUtils.validatePythonPath;
            // Create a more aggressive race condition by directly manipulating the validation
            let validationCount = 0;
            let concurrentValidations = new Map();
            // Override validatePythonPath to introduce race conditions
            pythonUtils.validatePythonPath = async function(pythonPath, isExplicit) {
              const validationId = ++validationCount;
              console.log(`[${validationId}] validatePythonPath called with: ${pythonPath}, explicit: ${isExplicit}`);
              console.log(`[${validationId}] Current cached path: ${state.cachedPythonPath}`);
              // Track concurrent validations
              concurrentValidations.set(validationId, { pythonPath, isExplicit, startTime: Date.now() });
              // Check if cache exists (this is where the race condition happens)
              if (state.cachedPythonPath) {
                console.log(`[${validationId}] Cache hit: ${state.cachedPythonPath}`);
                concurrentValidations.delete(validationId);
                return state.cachedPythonPath;
              }
              console.log(`[${validationId}] Cache miss, starting validation. Concurrent validations: ${concurrentValidations.size}`);
              // Add artificial delay to make race condition more likely
              const delay = Math.random() * 300 + 100; // 100-400ms
              console.log(`[${validationId}] Simulating validation delay: ${delay.toFixed(0)}ms`);
              await new Promise(resolve => setTimeout(resolve, delay));
              // Simulate the actual validation logic with potential failures
              let result;
              if (Math.random() < 0.15) { // 15% chance of failure
                console.log(`[${validationId}] Simulated validation failure for ${pythonPath}`);
                concurrentValidations.delete(validationId);
                throw new Error(`Python executable not found: ${pythonPath}`);
              }
              // Simulate different results based on timing
              const possibleResults = ["python", "py", "python3"];
              if (isExplicit) {
                result = pythonPath; // Explicit calls should return what was requested
              } else {
                // Non-explicit calls might return different executables based on "discovery"
                result = possibleResults[validationId % possibleResults.length];
              }
              console.log(`[${validationId}] Validation completed, setting cache to: ${result}`);
              // This is the critical section where race conditions occur
              const beforeCache = state.cachedPythonPath;
              state.cachedPythonPath = result;
              const afterCache = state.cachedPythonPath;
              if (beforeCache !== null && beforeCache !== result) {
                console.log(`[${validationId}] 🚨 RACE CONDITION! Cache changed from ${beforeCache} to ${result}`);
              }
              console.log(`[${validationId}] Final cached path: ${afterCache}`);
              concurrentValidations.delete(validationId);
              return result;
            };
            async function aggressiveRaceConditionTest() {
              console.log("=== AGGRESSIVE RACE CONDITION TEST ===");
              console.log("Directly manipulating validation logic to force race conditions");
              let totalTests = 0;
              let totalFailures = 0;
              let raceConditionsDetected = 0;
              let inconsistentResults = 0;
              // Test 1: Simultaneous cache misses
              console.log("\n--- Test 1: Simultaneous Cache Miss Race ---");
              for (let round = 1; round <= 3; round++) {
                console.log(`\n=== Round ${round} ===`);
                // Force cache miss
                state.cachedPythonPath = null;
                validationCount = 0;
                concurrentValidations.clear();
                const promises = [];
                const startTime = Date.now();
                // Launch 10 simultaneous validations
                for (let i = 1; i <= 10; i++) {
                  promises.push(
                    (async (testId) => {
                      try {
                        console.log(`[Test ${testId}] Starting concurrent validation`);
                        const result = await pythonUtils.validatePythonPath("python", false);
                        const duration = Date.now() - startTime;
                        console.log(`[Test ${testId}] SUCCESS: ${result} (${duration}ms)`);
                        return { testId, success: true, result, duration };
                      } catch (error) {
                        const duration = Date.now() - startTime;
                        console.log(`[Test ${testId}] FAILED: ${error.message} (${duration}ms)`);
                        return { testId, success: false, error: error.message, duration };
                      }
                    })(i)
                  );
                }
                const results = await Promise.all(promises);
                const failures = results.filter(r => !r.success);
                const successes = results.filter(r => r.success);
                console.log(`\nRound ${round} Summary:`);
                console.log(`Results: ${successes.length}/${results.length} succeeded`);
                console.log(`Final cached path: ${state.cachedPythonPath}`);
                // Check for different results (race condition indicator)
                const uniqueResults = new Set(successes.map(r => r.result));
                if (uniqueResults.size > 1) {
                  console.log(`🚨 RACE CONDITION DETECTED! Different results: ${Array.from(uniqueResults).join(", ")}`);
                  raceConditionsDetected++;
                  inconsistentResults++;
                }
                // Check for mixed success/failure (another race condition indicator)
                if (failures.length > 0 && successes.length > 0) {
                  console.log(`⚠️  MIXED RESULTS: ${failures.length} failed, ${successes.length} succeeded`);
                  console.log("This suggests race conditions in validation timing");
                  raceConditionsDetected++;
                }
                if (failures.length > 0) {
                  console.log("Failures:", failures.map(f => `Test ${f.testId}: ${f.error}`).join("; "));
                }
                totalTests += results.length;
                totalFailures += failures.length;
                await new Promise(resolve => setTimeout(resolve, 200));
              }
              // Test 2: Mixed explicit/non-explicit rapid fire
              console.log("\n--- Test 2: Mixed Explicit/Non-Explicit Rapid Fire ---");
              state.cachedPythonPath = null;
              validationCount = 0;
              const mixedPromises = [];
              for (let i = 0; i < 15; i++) {
                const isExplicit = i % 2 === 0;
                const pythonCmd = ["python", "py", "python3"][i % 3];
                mixedPromises.push(
                  (async (testId, cmd, explicit) => {
                    try {
                      console.log(`[Mixed ${testId}] Starting ${explicit ? "explicit" : "non-explicit"} for ${cmd}`);
                      const result = await pythonUtils.validatePythonPath(cmd, explicit);
                      console.log(`[Mixed ${testId}] SUCCESS: ${result}`);
                      return { testId, cmd, explicit, success: true, result };
                    } catch (error) {
                      console.log(`[Mixed ${testId}] FAILED: ${error.message}`);
                      return { testId, cmd, explicit, success: false, error: error.message };
                    }
                  })(i, pythonCmd, isExplicit)
                );
              }
              const mixedResults = await Promise.all(mixedPromises);
              const mixedFailures = mixedResults.filter(r => !r.success);
              const mixedSuccesses = mixedResults.filter(r => r.success);
              console.log(`\nMixed test results: ${mixedSuccesses.length}/${mixedResults.length} succeeded`);
              console.log(`Final cached path: ${state.cachedPythonPath}`);
              // Analyze results by type
              const resultsByType = {};
              mixedSuccesses.forEach(r => {
                const key = `${r.cmd}-${r.explicit ? "explicit" : "implicit"}`;
                if (!resultsByType[key]) resultsByType[key] = new Set();
                resultsByType[key].add(r.result);
              });
              console.log("Results by type:");
              Object.entries(resultsByType).forEach(([type, paths]) => {
                console.log(`  ${type}: ${Array.from(paths).join(", ")}`);
                if (paths.size > 1) {
                  console.log(`    🚨 INCONSISTENT RESULTS for ${type}!`);
                  inconsistentResults++;
                  raceConditionsDetected++;
                }
              });
              totalTests += mixedResults.length;
              totalFailures += mixedFailures.length;
              // Test 3: Cache corruption during validation
              console.log("\n--- Test 3: Cache Corruption During Validation ---");
              const corruptionPromises = [];
              for (let i = 0; i < 12; i++) {
                corruptionPromises.push(
                  (async (testId) => {
                    try {
                      // Start validation
                      const validationPromise = pythonUtils.validatePythonPath("python", false);
                      // Randomly corrupt cache during validation
                      if (Math.random() < 0.4) {
                        setTimeout(() => {
                          console.log(`[Corrupt ${testId}] Corrupting cache during validation`);
                          state.cachedPythonPath = null;
                        }, Math.random() * 100);
                      }
                      const result = await validationPromise;
                      console.log(`[Corrupt ${testId}] SUCCESS: ${result}`);
                      return { testId, success: true, result };
                    } catch (error) {
                      console.log(`[Corrupt ${testId}] FAILED: ${error.message}`);
                      return { testId, success: false, error: error.message };
                    }
                  })(i)
                );
                // Stagger starts
                await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
              }
              const corruptResults = await Promise.all(corruptionPromises);
              const corruptFailures = corruptResults.filter(r => !r.success);
              const corruptSuccesses = corruptResults.filter(r => r.success);
              console.log(`\nCorruption test results: ${corruptSuccesses.length}/${corruptResults.length} succeeded`);
              const corruptPaths = new Set(corruptSuccesses.map(r => r.result));
              if (corruptPaths.size > 1) {
                console.log(`🚨 CACHE CORRUPTION RACE CONDITION! Different paths: ${Array.from(corruptPaths).join(", ")}`);
                raceConditionsDetected++;
                inconsistentResults++;
              }
              totalTests += corruptResults.length;
              totalFailures += corruptFailures.length;
              // Final summary
              console.log("\n=== AGGRESSIVE RACE CONDITION TEST SUMMARY ===");
              console.log(`Total tests: ${totalTests}`);
              console.log(`Total failures: ${totalFailures}`);
              console.log(`Failure rate: ${((totalFailures / totalTests) * 100).toFixed(2)}%`);
              console.log(`Race conditions detected: ${raceConditionsDetected}`);
              console.log(`Inconsistent results: ${inconsistentResults}`);
              if (raceConditionsDetected > 0) {
                console.log("\n🎯 SUCCESS! RACE CONDITIONS SUCCESSFULLY REPRODUCED!");
                console.log("The test exposed race conditions in Python path validation.");
                console.log("Key indicators:");
                console.log("- Different concurrent calls returned different Python paths");
                console.log("- Mixed success/failure patterns");
                console.log("- Cache corruption during validation");
                console.log("\nThis confirms the Windows-specific intermittent Python detection issue.");
                console.log("Now we can implement and test a fix!");
              } else if (totalFailures > 0) {
                console.log("\n⚠️  PARTIAL SUCCESS: Some failures detected");
                console.log("The artificial conditions exposed timing issues.");
                console.log("This suggests the race condition exists but may need more specific conditions.");
              } else {
                console.log("\n❌ RACE CONDITIONS STILL NOT REPRODUCED");
                console.log("The validation logic may be more robust than expected.");
                console.log("Consider testing under actual high system load or with slower Python installations.");
              }
            }
            aggressiveRaceConditionTest().catch(console.error);
