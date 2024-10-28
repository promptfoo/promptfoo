const { parseJson, getCorrectAnswers } = require('./shared');

module.exports = (output, context) => {
  const parsed = parseJson(output);
  const justLabels = parsed.map((answer) => answer.label);
  const correctAnswers = getCorrectAnswers(context);
  const foundMissing = correctAnswers.filter((i) => !justLabels.includes(i));
  return (foundMissing / correctAnswers) * 100.0;
}
