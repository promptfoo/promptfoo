// Assertion function that verifies dynamic vars are resolved
// Tests fix for GitHub issue #7334
module.exports = function (_output, context) {
  const dynamicVar = context.vars.DYNAMIC_VAR;

  // Check if the variable was resolved (should be an ISO date string)
  // or still has the file:// prefix (bug)
  if (typeof dynamicVar === 'string' && dynamicVar.startsWith('file://')) {
    return {
      pass: false,
      score: 0,
      reason: `BUG: DYNAMIC_VAR was not resolved! Got raw file path: ${dynamicVar}`,
    };
  }

  // Validate it's a valid ISO date
  const date = new Date(dynamicVar);
  if (isNaN(date.getTime())) {
    return {
      pass: false,
      score: 0,
      reason: `DYNAMIC_VAR is not a valid date: ${dynamicVar}`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `DYNAMIC_VAR was correctly resolved to: ${dynamicVar}`,
  };
};
