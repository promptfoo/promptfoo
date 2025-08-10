export default function debug(output: any, context: any) {
  console.log('=== DEBUG SCORER ===');
  console.log('Output type:', typeof output);
  console.log('Output keys:', output ? Object.keys(output) : 'null');
  console.log('Output.result:', output?.result);
  console.log('Output.summary:', output?.summary);
  console.log('Context keys:', context ? Object.keys(context) : 'null');
  console.log('===================');
  
  return {
    pass: true,
    score: 1,
    reason: `Debug: ${output?.result || 'no result'}`
  };
} 