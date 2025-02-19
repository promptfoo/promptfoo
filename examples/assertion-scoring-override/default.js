// Default scoring function that weights metrics by geometric mean
module.exports = (namedScores, context) => {
  console.log('Default scoring function (JavaScript):', namedScores);

  const scores = {};
  for (const [key, value] of Object.entries(namedScores)) {
    scores[key] = value || 0;
  }

  const totalScore = Math.pow(
    Object.values(scores).reduce((acc, score) => acc * score, 1),
    1 / Object.keys(scores).length,
  );

  return {
    pass: totalScore >= (context?.threshold || 0.7),
    score: totalScore,
    reason: `Weighted score calculation: ${Object.entries(scores)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ')}`,
  };
};
