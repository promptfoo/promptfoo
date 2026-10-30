module.exports = (output, context) => {
  const expected = context.vars.expected;
  if (!['answer', 'clarify'].includes(expected)) {
    throw new Error('Expected label must be answer or clarify');
  }
  let decision;
  try {
    const parsed = typeof output === 'string' ? JSON.parse(output) : output;
    decision = parsed?.decision;
  } catch {
    // Invalid outputs remain failures and stay in the accuracy denominator.
  }
  const valid = ['answer', 'clarify'].includes(decision);
  const correct = valid && decision === expected;
  return {
    pass: correct,
    score: Number(correct),
    reason: valid
      ? correct
        ? 'Correct decision'
        : `Expected ${expected}, got ${decision}`
      : 'Invalid decision: expected answer or clarify',
    namedScores: {
      cases: 1,
      correct: Number(correct),
      invalid: Number(!valid),
      needs_clarification: Number(expected === 'clarify'),
      answerable: Number(expected === 'answer'),
      missed_clarification: Number(valid && expected === 'clarify' && decision === 'answer'),
      unnecessary_clarification: Number(valid && expected === 'answer' && decision === 'clarify'),
    },
  };
};
