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

## Learn More

- [Vertex AI Provider Documentation](https://www.promptfoo.dev/docs/providers/vertex/)
- [Google Cloud Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [promptfoo Documentation](https://www.promptfoo.dev/docs/)
