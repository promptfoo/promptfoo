# Google Vertex AI Examples

This directory contains example configurations for testing different Google Vertex AI models using promptfoo. The examples demonstrate various features and capabilities of Vertex AI models.

## Configuration Files

- `promptfooconfig.gemini.yaml`: Examples using Gemini 2.0 models

  - Function calling and tools
  - System instructions
  - Safety settings
  - Context and examples

- `promptfooconfig.claude.yaml`: Examples using Claude models

  - Code analysis tools
  - Documentation search
  - Technical writing tests
  - Context customization

- `promptfooconfig.llama.yaml`: Examples using Llama models

  - Vision capabilities
  - Safety with Llama Guard
  - Complex reasoning tasks
  - Text generation

- `promptfooconfig.search.yaml`: Examples using Search grounding
  - Google Search integration with Gemini models
  - Real-time information retrieval
  - Web-grounded responses
  - Support for current events, financial data, and technical updates

## Prerequisites

1. Install the Google Auth Library:

   ```sh
   npm install google-auth-library
   ```

2. Enable the Vertex AI API in your Google Cloud project:

   - Visit the [Google Cloud Console](https://console.cloud.google.com)
   - Enable the Vertex AI API
   - Set up authentication

3. Configure authentication:

   ```sh
   # Option 1: User Account (recommended for development)
   gcloud auth application-default login

   # Option 2: Service Account
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
   ```

## Running the Examples

1. Set your Google Cloud project:

   ```sh
   gcloud config set project YOUR_PROJECT_ID
   ```

2. Run specific model tests:

   ```sh
   # Test Gemini models
   promptfoo eval -c promptfooconfig.gemini.yaml

   # Test Claude models
   promptfoo eval -c promptfooconfig.claude.yaml

   # Test Llama models
   promptfoo eval -c promptfooconfig.llama.yaml

   # Test Search grounding
   promptfoo eval -c promptfooconfig.search.yaml
   ```

3. View results:
   ```sh
   promptfoo view
   ```

## Features Demonstrated

- Model-specific configurations
- Function calling and tools
- System instructions
- Safety settings
- Context and examples
- Vision capabilities
- Complex reasoning tasks
- Technical writing
- Code analysis
- Search grounding with real-time information

## Using Search Grounding

The search grounding feature allows Gemini models on Vertex AI to access up-to-date information from the web, making responses more accurate for:

- Current events and news
- Recent developments
- Stock prices and market data
- Sports results
- Technical documentation updates

You can enable Search grounding using either of these formats:

```yaml
# String format (simpler)
tools: ['google_search']

# Object format (matches Google's API)
tools:
  - google_search: {}
```

When using Search grounding, the response includes metadata with:

- `groundingMetadata` - Information about search results
- `groundingChunks` - Web sources used
- `webSearchQueries` - Queries the model used
- `searchEntryPoint` - HTML for displaying Google Search Suggestions

**Note:** Google requires applications to display Search Suggestions when using search grounding in user-facing applications.

## Learn More

- [Vertex AI Provider Documentation](https://www.promptfoo.dev/docs/providers/vertex/)
- [Google Cloud Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Google documentation on Grounding with Google Search](https://ai.google.dev/docs/gemini_api/grounding)
- [promptfoo Documentation](https://www.promptfoo.dev/docs/)
