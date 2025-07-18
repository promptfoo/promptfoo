/**
 * Sample weather function callback implementation
 * @param {object} args - Object with the function arguments (already parsed)
 * @returns {string} - JSON string with the weather information
 */
function getWeather(args) {
  try {
    // Extract parameters with defaults
    const location = args.location;
    const unit = args.unit || 'celsius';

    if (!location) {
      return JSON.stringify({ error: 'Location is required' });
    }

    // Mock weather data
    const mockWeather = {
      location,
      temperature: unit === 'celsius' ? 22 : 72,
      unit,
      forecast: ['sunny', 'partly cloudy', 'clear'][Math.floor(Math.random() * 3)],
      humidity: Math.floor(Math.random() * 40) + 30,
    };

    return JSON.stringify(mockWeather);
  } catch (error) {
    console.error('Error in getWeather function:', error);
    return JSON.stringify({ error: `Failed to process weather request: ${error.message}` });
  }
}

module.exports = { getWeather };
