

const { WatsonXProvider } = require('./src/providers/watsonx');

async function runWatsonXTest() {
  const provider = new WatsonXProvider('test-model', {
    config: {
      apiKey: '',  
      serviceUrl: 'https://us-south.ml.cloud.ibm.com', 
      spaceId: '6391143c-d140-4a59-bdae-cf4ccc2f7cfc', 
      modelId: 'ibm/granite-13b-chat-v2',  
      maxNewTokens: 50,  
    },
  });

  try {
    const response = await provider.callApi('Hello WatsonX!');
    console.log('Response from WatsonX:', response);
  } catch (error) {
    console.error('Error calling WatsonX API:', error);
  }
}

runWatsonXTest();
