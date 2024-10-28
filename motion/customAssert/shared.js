const parseJson = (output) => {
  const cleanedUp = output.replace('```json', '').replace('```', '');
  return JSON.parse(cleanedUp);
};

const commaDelimitedToArray = (str) => str.split(',').map((i) => i.trim()).filter((i) => !!i);

const getCorrectAnswers = (context) => commaDelimitedToArray(context.vars.correctAnswers);

module.exports = {
  parseJson,
  commaDelimitedToArray,
  getCorrectAnswers,
};
