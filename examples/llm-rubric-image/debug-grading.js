// Custom assertion to debug what variables are available during grading
module.exports = async function debugGrading(output, context) {
  console.log('\n=== DEBUG: Grading Context ===');
  console.log('Output length:', output.length);
  console.log('Output preview:', output.substring(0, 200) + '...');

  console.log('\nAvailable variables:');
  if (context.vars) {
    for (const [key, value] of Object.entries(context.vars)) {
      if (typeof value === 'string') {
        if (value.length > 100) {
          console.log(`  ${key}: [string, length: ${value.length}]`);
          // Check if it looks like base64 image data
          if (value.match(/^[A-Za-z0-9+/]{100,}={0,2}$/)) {
            console.log(`    -> Appears to be base64 data`);
          }
        } else {
          console.log(`  ${key}: "${value}"`);
        }
      } else {
        console.log(`  ${key}: [${typeof value}]`);
      }
    }
  }

  console.log('\nPrompt:', context.prompt ? context.prompt.substring(0, 100) + '...' : 'N/A');
  console.log('=========================\n');

  // Always pass to see the output
  return {
    pass: true,
    score: 1.0,
    reason: 'Debug assertion - check console output',
  };
};
