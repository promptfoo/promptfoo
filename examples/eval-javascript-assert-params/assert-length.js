module.exports = (output, context) => {
  const minLength = context.config?.minLength;
  if (typeof minLength !== 'number') {
    throw new Error('Expected assertion config.minLength to be a number');
  }

  const actualLength = output.length;

  return {
    pass: actualLength >= minLength,
    score: actualLength,
    reason: `Output length ${actualLength} vs minLength ${minLength}`,
  };
};
