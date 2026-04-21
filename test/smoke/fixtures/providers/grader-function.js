/**
 * Function-based grader provider (#6174)
 *
 * Tests that function providers work in defaultTest.options.provider.
 * This is a grader that always passes.
 */

module.exports = async function (_prompt, context) {
  // Simple grader that checks if output contains expected content
  const output = context.vars?.output || '';
  const pass = output.length > 0;

  return {
    output: JSON.stringify({
      pass: pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Output is not empty' : 'Output is empty',
    }),
  };
};
