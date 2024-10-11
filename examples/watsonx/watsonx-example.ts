import { WatsonXProvider } from '../../src/providers/watsonx';

(async () => {
  const apiKey = process.env.WATSONX_API_KEY;
  const projectId = process.env.WATSONX_PROJECT_ID;
  const modelId = process.env.WATSONX_MODEL_ID;
  const serviceUrl = process.env.WATSONX_SERVICE_URL || 'https://us-south.ml.cloud.ibm.com';

  if (!apiKey || !projectId || !modelId) {
    console.error('Missing required environment variables.');
    return;
  }
  const provider = new WatsonXProvider('ibm/granite-13b-chat-v2', {
    config: {
      apiKey,
      projectId,
      modelId,
      serviceUrl,
      maxNewTokens: 50,
    },
  });

  try {
    const prompt = 'Tell me a fun fact about the ocean.';
    const response = await provider.callApi(prompt);
    if (response.error) {
      console.error('Error from WatsonXProvider:', response.error);
    } else {
      console.log('Generated Text:', response.output);
      console.log('Token Usage:', response.tokenUsage);
    }
  } catch (error) {
    console.error('Error calling WatsonX API:', error);
  }
})();
