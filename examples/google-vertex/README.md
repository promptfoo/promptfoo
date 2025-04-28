# Google Vertex AI Examples

This directory contains example configurations for testing different Google Vertex AI models and capabilities.

## Example Files

- `promptfooconfig.yaml`: Basic examples using Gemini models

  - Vision capabilities
  - Function calling
  - Structured output
  - Complex reasoning
  - Context customization
  - System instructions
  - Safety settings

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

- `promptfooconfig.code.yaml`: Examples using Code Execution

  - Python code generation and execution
  - Mathematical problem solving
  - Data visualization with matplotlib
  - Statistical analysis and computations

- `promptfooconfig.claude.yaml`: Examples using Claude models
  - Code analysis tools
  - Documentation search
  - Technical writing tests
  - Context customization

## Prerequisites

1. Install the Google Auth Library:

   ```bash
   npm install google-auth-library
   ```

2. Set up authentication with Vertex AI:

   You can use one of the following methods:

   a. Use Application Default Credentials (recommended):

   ```bash
   gcloud auth application-default login
   ```

   b. Provide a Vertex API key in your environment variables:

   ```bash
   export VERTEX_API_KEY=your_api_key
   ```

   c. Provide an access token and project ID in your environment variables:

   ```bash
   export VERTEX_ACCESS_TOKEN=your_access_token
   export VERTEX_PROJECT_ID=your_project_id
   ```

## Running the Examples

1. Ensure you have the required dependencies:

   ```bash
   npm install
   ```

2. Run the examples:

   ```bash
   # Test basic Gemini functionality
   promptfoo eval -c promptfooconfig.yaml

   # Test Llama models
   promptfoo eval -c promptfooconfig.llama.yaml

   # Test Search grounding
   promptfoo eval -c promptfooconfig.search.yaml

   # Test Code execution
   promptfoo eval -c promptfooconfig.code.yaml
   ```

3. View results:

   ```bash
   promptfoo view
   ```

## Features Tested

- Multimodal input (text, images, audio, video)
- Complex reasoning tasks
- Technical writing
- Code analysis
- Search grounding with real-time information
- Code execution with Python

## Learn More

- [Vertex AI Provider Documentation](https://www.promptfoo.dev/docs/providers/vertex/)
- [Google Cloud Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Google documentation on Grounding with Google Search](https://ai.google.dev/docs/gemini_api/grounding)
- [Google documentation on Code Execution](https://ai.google.dev/docs/gemini_api/code_execution)
- [promptfoo Documentation](https://www.promptfoo.dev/docs/)
