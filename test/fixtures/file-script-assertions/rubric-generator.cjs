// Test fixture for file-based script assertions
// Used to test that script output is correctly passed to assertion handlers

module.exports.rubric = (_output, context) => {
  return `Check that the output correctly addresses: ${context.vars.topic}`;
};

module.exports.expectedValue = () => 'expected string';

// For deterministic testing - script returns a known value
module.exports.knownValue = () => 'SCRIPT_OUTPUT_12345';

// Returns an object for llm-rubric (which accepts objects)
module.exports.rubricObject = () => ({
  role: 'system',
  content: 'Evaluate the response for accuracy',
});

// Returns a number for contains assertion
module.exports.numericValue = () => 42;

// Returns an array for bleu/gleu assertions
module.exports.referenceArray = () => ['reference one', 'reference two'];

// Returns empty string
module.exports.emptyValue = () => '';

// Returns null (edge case)
module.exports.nullValue = () => null;

// Returns undefined (edge case)
module.exports.undefinedValue = () => undefined;

// Returns a function (should cause error for non-script assertions)
module.exports.functionValue = () => () => 'nested function';

// Returns a boolean (should cause error for non-script assertions)
module.exports.booleanValue = () => true;

// Returns a GradingResult (should cause error for non-script assertions)
module.exports.gradingResultValue = () => ({
  pass: true,
  score: 1,
  reason: 'This is a grading result',
});

// Dynamic regex pattern based on context
module.exports.getPattern = (_output, context) => {
  return context.vars.pattern || '\\d+';
};

// For regression testing - javascript assertion that returns GradingResult
module.exports.gradingFunction = (output, _context) => {
  const pass = output.includes('expected');
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Output contains expected' : 'Output missing expected',
  };
};
