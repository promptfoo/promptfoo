/**
 * Simple formatting configuration - this is here to demonstrate how to load formatting configuration from a JavaScript file
 */
function getFormatConfig() {
  return {
    uppercase: false,
    prefix: 'Question:',
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getFormatConfig,
};
