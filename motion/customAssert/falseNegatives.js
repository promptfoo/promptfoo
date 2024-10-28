const { lte, parseJson, getCorrectAnswers } = require('./shared');

module.exports = (output, context) => {
  const parsed = parseJson(output);
  const justLabels = parsed.map((answer) => answer.label);
  const correctAnswers = getCorrectAnswers(context);
  const foundMissing = correctAnswers.filter((i) => !justLabels.includes(i));
  const score = (foundMissing.length / correctAnswers.length) * 100.0;
  return lte(score, context.config.threshold);
}
