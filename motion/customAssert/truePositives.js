const { parseJson, getCorrectAnswers } = require('./shared');

module.exports = (output, context) => {
  const parsed = parseJson(output);
  const correctAnswers = getCorrectAnswers(context);
  const foundCorrect = parsed.filter((answer) => correctAnswers.includes(answer.label));
  return (foundCorrect / correctAnswers) * 100.0;
}