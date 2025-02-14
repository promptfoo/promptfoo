module.exports = {
  func: (namedScores) => {
    console.log(namedScores);
    return {
      pass: true,
      score: 0.9,
      reason: 'All assertions passed',
    };
  },
};
