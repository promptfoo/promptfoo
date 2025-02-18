module.exports = {
  validateHistory: (output, context) => {
    console.log('Validating history with output:', JSON.stringify(output));
    console.log('Context:', JSON.stringify(context));

    try {
      // If output is a string, try to parse it
      const data = typeof output === 'string' ? JSON.parse(output) : output;

      if (!data || typeof data !== 'object') {
        return {
          pass: false,
          score: 0,
          reason: 'Invalid output format',
        };
      }

      if (!Array.isArray(data.history)) {
        return {
          pass: false,
          score: 0,
          reason: 'History is not an array',
        };
      }

      return {
        pass: true,
        score: 1,
        reason: `History array found with ${data.history.length} items`,
      };
    } catch (e) {
      return {
        pass: false,
        score: 0,
        reason: `Error validating history: ${e.message}`,
      };
    }
  },
};
