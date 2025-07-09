// Default provider for ADK tracing example
// This exports the mock provider that generates realistic traces without external dependencies

// For mock traces only (no API keys required):
module.exports = require('./provider-with-traces.js');

// For real LLM calls (requires OPENAI_API_KEY):
// module.exports = require('./provider-with-llm.js');
