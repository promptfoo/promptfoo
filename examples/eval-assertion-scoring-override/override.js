const overrideScoring = (namedScores, context) => {
  console.log('Override scoring function (JavaScript):', namedScores);
  const accuracyScore = namedScores.accuracy || 0;
  const fluencyScore = namedScores.fluency || 0;
  const grammarScore = namedScores.grammar || 0;
  const bananaScore = namedScores.banana || 0;

  const minScore = Math.min(accuracyScore, fluencyScore, grammarScore, bananaScore);
  const threshold = context?.threshold ?? 0.7;
  return {
    pass: minScore >= threshold,
    score: minScore,
    reason:
      `minimum score: ${minScore.toFixed(2)} (threshold: ${threshold})\n` +
      `Individual scores:\n` +
      `- contains banana: ${bananaScore.toFixed(2)}\n` +
      `- accuracy: ${accuracyScore.toFixed(2)}\n` +
      `- fluency: ${fluencyScore.toFixed(2)}\n` +
      `- grammar: ${grammarScore.toFixed(2)}`,
  };
};

module.exports = {
  overrideScoring,
};
