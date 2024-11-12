const { inspect } = require('util');

const parseJson = (output) => {
  const cleanedUp = output.replace('```json', '').replace('```', '');
  let result;
  try {
    result = JSON.parse(cleanedUp);
  } catch (error) {
    throw new Error(`Failed parsing output as JSON. Error: ${inspect(error, null, 3)}. Output: ${output}`);
  }

  if (!Array.isArray(result)) {
    return Object.keys(result).map((key) => ({ label: key, ...result[key] }));
  }
  return result;
};

const commaDelimitedToArray = (str) => str.split(',').map((i) => i.trim()).filter((i) => !!i);

const delimitedToArray = (str, delimiter) => str.split(delimiter).map((i) => i.trim()).filter((i) => !!i);

const getCorrectAnswers = (context) => {
  if (context.vars.correctAnswers.indexOf(',') > 0) {
    return delimitedToArray(context.vars.correctAnswers, ',');
  }
  if (context.vars.correctAnswers.indexOf('\n') > 0) {
    return delimitedToArray(context.vars.correctAnswers, '\n');
  }

  return [context.vars.correctAnswers.trim()];
}

const getGradingResult = (pass, score, reason) => {
  return { pass, score, reason };
  // return JSON.stringify({ pass, score, reason });
}

const lte = (score, threshold) => {
  if (score > threshold) {
    return getGradingResult(false, score, `Score ${score} is less than threshold ${threshold}`);
  }
  return getGradingResult(true, score, '');
}

const gte = (score, threshold) => {
  if (score < threshold) {
    return getGradingResult(false, score, `Score ${score} is lower than threshold ${threshold}`);
  }
  return getGradingResult(true, score, '');
}

module.exports = {
  delimitedToArray,
  parseJson,
  commaDelimitedToArray,
  getCorrectAnswers,
  getGradingResult,
  gte,
  lte,
};
