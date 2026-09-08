// Tool implementations invoked by promptfoo when the model requests them.
module.exports = {
  get_weather: (args) => {
    const { location } = typeof args === 'string' ? JSON.parse(args) : args;
    return JSON.stringify({ location, temperatureF: 52, conditions: 'rain' });
  },
};
