import { Sandbox } from '@e2b/code-interpreter';
import 'dotenv/config';

/**
 * Custom assertion that executes code and checks if output contains expected string
 * Usage:
 * assert:
 *   - type: javascript
 *     value: file://assertions/codeContains.js
 *     expected: "substring to find"
 */
export default async function codeContainsAssertion(output, context) {
  const { vars, test } = context;
  const expected = test.assert.find(a => a.type === 'javascript')?.expected;
  
  if (!expected) {
    return {
      pass: false,
      score: 0,
      reason: 'No expected value provided for contains assertion',
    };
  }
  
  let sandbox;
  
  try {
    const code = output;
    const fullCode = vars?.testCode 
      ? `${code}\n\n${vars.testCode}`
      : code;
    
    sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
    });
    
    const execution = await sandbox.runCode(fullCode, {
      timeout: vars?.timeout || 10000,
    });
    
    const stdout = execution.logs.stdout.join('\n');
    const stderr = execution.logs.stderr.join('\n');
    
    if (execution.error || stderr) {
      return {
        pass: false,
        score: 0,
        reason: `Code execution failed: ${execution.error || stderr}`,
      };
    }
    
    const contains = stdout.includes(expected);
    
    return {
      pass: contains,
      score: contains ? 1 : 0,
      reason: contains
        ? `Output contains "${expected}"`
        : `Output does not contain "${expected}". Actual output: "${stdout}"`,
    };
    
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Assertion failed: ${error.message}`,
    };
  } finally {
    if (sandbox) {
      await sandbox.kill();
    }
  }
} 