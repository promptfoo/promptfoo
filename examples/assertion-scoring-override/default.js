// Default scoring function that weights metrics differently
module.exports = (namedScores, context) => {
  console.log('Default scoring function (JavaScript):', namedScores);

  // Weight accuracy metrics more heavily
  const accuracyScore = (namedScores.accuracy || 0) * 1.5;
  const fluencyScore = namedScores.fluency || 0;
  const grammarScore = namedScores.grammar || 0;

  const totalScore = (accuracyScore + fluencyScore + grammarScore) / 3;

  return {
    pass: totalScore >= 0.7,
    score: totalScore,
    reason: `Weighted score calculation: accuracy(1.5x): ${accuracyScore}, fluency: ${fluencyScore}, grammar: ${grammarScore}`,
  };
};
