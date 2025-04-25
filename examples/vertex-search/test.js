// Example of using Vertex AI Search grounding programmatically with promptfoo

const { evaluate } = require('promptfoo');

async function runVertexSearchDemo() {
  console.log('Running Vertex AI Search grounding demo...');

  const results = await evaluate({
    prompts: [
      'What is the current price of Bitcoin?',
      'What were the latest changes in the US Federal Reserve interest rates?',
      'What are the most recent breakthroughs in quantum computing?',
    ],
    providers: [
      {
        id: 'vertex:gemini-2.0-pro',
        config: {
          // Enable Google Search with simple string syntax
          tools: ['google_search'],
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      },
    ],
    tests: [
      {
        // All questions will get real-time information from the web
        assert: [
          { type: 'contains', value: 'Bitcoin' },
          { type: 'contains', value: 'price' },
        ],
      },
    ],
  });

  // Print a summary of the results
  console.log('\nVertex AI Search Grounding Results:');
  for (const result of results.results) {
    console.log(`\nQuery: ${result.prompt}`);
    console.log(`Response: ${result.outputs[0].output.substring(0, 200)}...`);

    // Check if groundingMetadata is present (indicates search was used)
    const hasSearchMetadata = result.outputs[0].raw?.candidates?.[0]?.groundingMetadata;
    console.log(`Search was used: ${hasSearchMetadata ? 'Yes' : 'No'}`);

    if (hasSearchMetadata) {
      // Show search queries used
      const searchQueries =
        result.outputs[0].raw.candidates[0].groundingMetadata.webSearchQueries || [];
      console.log(`Search queries: ${searchQueries.join(', ')}`);
    }
  }
}

// Run the demo if executed directly
if (require.main === module) {
  runVertexSearchDemo().catch((error) => console.error('Error running demo:', error));
}

module.exports = { runVertexSearchDemo };
