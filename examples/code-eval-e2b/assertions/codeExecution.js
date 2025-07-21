import { Sandbox } from '@e2b/code-interpreter';
import 'dotenv/config';

/**
 * Custom assertion that executes code in E2B sandbox and validates output
 * Usage: 
 * assert:
 *   - type: javascript
 *     value: file://assertions/codeExecution.js
 * 
 * Set vars.expectedOutput to validate output
 */
export default async function codeExecutionAssertion(output, context) {
  const { vars } = context;
  const expected = vars?.expectedOutput;
  
  let sandbox;
  
  try {
    // The output from LLM is the code to execute
    const code = output;
    
    // Add any test code if specified in vars
    const fullCode = vars?.testCode 
      ? `${code}\n\n${vars.testCode}`
      : code;
    
    // Create sandbox
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
    });
    
    // Execute the code
    const execution = await sandbox.runCode(fullCode, {
      timeout: vars?.timeout || 10000,
    });
    
    // Get execution results
    const stdout = execution.logs.stdout.join('\n').trim();
    const stderr = execution.logs.stderr.join('\n');
    const hasError = execution.error || stderr.length > 0;
    
    // If there was an execution error, fail the assertion
    if (hasError) {
      return {
        pass: false,
        score: 0,
        reason: `Code execution failed: ${execution.error || stderr}`,
      };
    }
    
    // Compare output with expected value if provided
    if (expected !== undefined) {
      const pass = stdout === expected;
      return {
        pass,
        score: pass ? 1 : 0,
        reason: pass 
          ? `Output matches expected: "${expected}"`
          : `Output "${stdout}" does not match expected "${expected}"`,
      };
    }
    
    // If no expected value, just check that code ran successfully
    return {
      pass: true,
      score: 1,
      reason: `Code executed successfully. Output: "${stdout}"`,
    };
    
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Assertion failed: ${error.message}`,
    };
  } finally {
    // Always clean up
    if (sandbox) {
      await sandbox.kill();
    }
  }
} 