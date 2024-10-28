const { parseJson, getCorrectAnswers } = require('./shared');

module.exports = (output, context) => {
  const parsed = parseJson(output);
  const justLabels = parsed.map((answer) => answer.label);
  const correctAnswers = getCorrectAnswers(context);
  const wrongAnswers = justLabels.filter((i) => !correctAnswers.includes(i));
  return wrongAnswers.length;
}
