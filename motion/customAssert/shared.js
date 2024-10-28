const parseJson = (output) => {
  const cleanedUp = output.replace('```json', '').replace('```', '');
  const result = JSON.parse(cleanedUp);
  if (!Array.isArray(result)) {
    return Object.keys(result).map((key) => ({ label: key, ...result[key] }));
  }
  return result;
};

const commaDelimitedToArray = (str) => str.split(',').map((i) => i.trim()).filter((i) => !!i);

const getCorrectAnswers = (context) => commaDelimitedToArray(context.vars.correctAnswers);

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
  parseJson,
  commaDelimitedToArray,
  getCorrectAnswers,
  getGradingResult,
  gte,
  lte,
};
