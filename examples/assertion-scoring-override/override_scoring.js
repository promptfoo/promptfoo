// Override scoring function that focuses on grammar and fluency
module.exports = (namedScores, context) => {
  console.log('Override scoring function (JavaScript):', namedScores);

  // Prioritize grammar and fluency over accuracy
  const accuracyScore = namedScores.accuracy || 0;
  const fluencyScore = (namedScores.fluency || 0) * 1.5;
  const grammarScore = (namedScores.grammar || 0) * 1.5;

  const totalScore = (accuracyScore + fluencyScore + grammarScore) / 3;

  return {
    pass: totalScore >= 0.7,
    score: totalScore,
    reason: `Style-focused score: accuracy: ${accuracyScore}, fluency(1.5x): ${fluencyScore}, grammar(1.5x): ${grammarScore}`,
  };
};
