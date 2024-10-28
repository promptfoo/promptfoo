const { gte, parseJson, getCorrectAnswers } = require('./shared');

module.exports = (output, context) => {
  const parsed = parseJson(output);
  const correctAnswers = getCorrectAnswers(context);
  const foundCorrect = parsed.filter((answer) => correctAnswers.includes(answer.label));
  const score = (foundCorrect.length / correctAnswers.length) * 100.0;
  return gte(score, context.config.threshold);
}