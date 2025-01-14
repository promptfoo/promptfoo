// Set up environment variables for tests
if (!process.env.OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY not set. Tests requiring OpenAI API will fail.');
  console.warn('Please set OPENAI_API_KEY environment variable before running tests.');
}

// Set up environment variables for promptfoo
process.env.PROMPTFOO_OPENAI_API_KEY = process.env.OPENAI_API_KEY;
process.env.PROMPTFOO_CACHE_DIR = '.promptfoo-cache'; // Enable caching for faster tests
process.env.PROMPTFOO_NO_ANALYTICS = '1'; // Disable analytics in tests
