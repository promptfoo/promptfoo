# Azure OpenAI Vision Setup Guide

## Environment Variables Required

To run the Azure OpenAI vision examples, you need the following environment variables in your `.env` file:

1. **AZURE_API_KEY** - ✅ Already present in your .env
2. **AZURE_API_HOST** - ❌ Missing - Add this to your .env file

## Adding the Missing Azure Host

Add the following line to your `.env` file:

```
AZURE_API_HOST=your-resource-name.openai.azure.com
```

Replace `your-resource-name` with your actual Azure OpenAI resource name.

## Testing Your Setup

Once you've added the Azure host, you can test with:

```bash
# Load environment variables and run the test
npx dotenv-cli -e .env -- npm run local -- eval -c examples/azure-openai-vision/test-simple.yaml
```

## Your Deployment Information

Based on the information you provided earlier:
- Model: gpt-4o-2 (version: 2024-08-06)
- Deployment name: promptfoo
- Region: eastus

Make sure your Azure host matches the resource where this deployment exists. 