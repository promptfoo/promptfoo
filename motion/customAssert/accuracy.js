const { parseJson, getCorrectAnswers } = require('./shared');

module.exports = (output, context) => {
  const parsed = parseJson(output);
  const justLabels = parsed.map((answer) => answer.label);
  const correctAnswers = getCorrectAnswers(context);

  const falseNegativesItems = correctAnswers.filter((i) => !justLabels.includes(i));
  const falseNegativesScore = (falseNegativesItems.length / correctAnswers.length) * 100.0;
  const falseNegatives = {
    score: falseNegativesScore,
    pass: falseNegativesScore <= context.config.falseNegativeThreshold,
    reason: 'False Negatives',
  };

  const falsePositiveItems = justLabels.filter((i) => !correctAnswers.includes(i));
  const falsePositiveCount = falsePositiveItems.length;
  const falsePositives = {
    score: falsePositiveItems.length,
    pass: falsePositiveCount <= context.config.falsePositiveThreshold,
    reason: 'False Positives',
  };

  const truePositiveItems = justLabels.filter((label) => correctAnswers.includes(label));
  const truePositiveScore = (truePositiveItems.length / correctAnswers.length) * 100.0;

  const truePositives = {
    score: truePositiveScore,
    pass: truePositiveScore >= context.config.truePositiveThreshold,
    reason: 'True Positives',
  };

  const reasons = [];
  if (!falseNegatives.pass) {
    falseNegatives.reason = `False Negatives: ${falseNegatives.score} > ${context.config.falseNegativeThreshold}`;
    reasons.push('False negatives');
  }
  if (!falsePositives.pass) {
    falsePositives.reason = `False Positives: ${falsePositives.score} > ${context.config.falsePositiveThreshold}`;
    reasons.push('False positives');
  }
  if (!truePositives.pass) {
    truePositives.reason = `True Positives: ${truePositives.score} < ${context.config.truePositiveThreshold}`;
    reasons.push('True positives');
  }

  const pass = reasons.length === 0;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: reasons.join(', '),
    componentResults: [falseNegatives, falsePositives, truePositives],
  }
};