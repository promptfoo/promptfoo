// Test script for Azure Assistant with function callback
const path = require('path');
const { AzureAssistantProvider } = require('./dist/src/providers/azure');

async function main() {
  // REPLACE THIS WITH YOUR ACTUAL AZURE OPENAI API KEY
  const apiKey = process.env.AZURE_API_KEY || process.env.AZURE_OPENAI_API_KEY || 'YOUR_AZURE_OPENAI_API_KEY_HERE';
  
  if (apiKey === 'YOUR_AZURE_OPENAI_API_KEY_HERE') {
    console.warn('\n⚠️  WARNING: You need to replace "YOUR_AZURE_OPENAI_API_KEY_HERE" with your actual Azure OpenAI API key');
    console.warn('   Set it via the AZURE_API_KEY environment variable or directly in this file\n');
  } else {
    console.log('Using API key:', apiKey.substring(0, 3) + '...' + apiKey.substring(apiKey.length - 3));
  }
  
  // Define the weather function callback inline
  const weatherCallback = async (args) => {
    try {
      const parsedArgs = JSON.parse(args);
      const location = parsedArgs.location;
      const unit = parsedArgs.unit || 'celsius';
      console.log(`Weather request for ${location} in ${unit}`);
      
      // Simple weather response
      const temp = unit === 'celsius' ? 22 : 72;
      return JSON.stringify({
        location,
        temperature: temp,
        unit,
        condition: 'sunny',
        forecast: 'Clear skies for the next few days.'
      });
    } catch (error) {
      console.error('Error in weather function:', error);
      return JSON.stringify({ error: String(error) });
    }
  };
  
  // Create the provider
  const provider = new AzureAssistantProvider('asst_example', {
    config: {
      apiHost: process.env.AZURE_OPENAI_API_HOST || 'promptfoo.openai.azure.com',
      apiKey: apiKey,
      functionToolCallbacks: {
        get_weather: weatherCallback
      },
      tools: require('./examples/azure-openai-assistant/tools/weather-function.json'),
      apiVersion: '2024-05-01-preview',
      debug: true
    }
  });

  // Call the API
  console.log('Calling Azure Assistant API...');
  const result = await provider.callApi("What's the weather like in Seattle?");
  console.log('Result:', result);
}

main().catch(console.error);
