/**
 * JavaScript assertion file (5.2.2)
 * Checks that output meets minimum length requirement
 */
module.exports = (output, context) => {
  const minLength = context.test?.assert?.[0]?.config?.minLength || 5;
  const actualLength = output.length;

  if (actualLength >= minLength) {
    return {
      pass: true,
      score: 1.0,
      reason: `Output length (${actualLength}) meets minimum (${minLength})`,
    };
  }

  return {
    pass: false,
    score: actualLength / minLength,
    reason: `Output length (${actualLength}) below minimum (${minLength})`,
  };
};
