# google-vertex (Google Vertex AI Examples)

Example configurations for testing Google Vertex AI models with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example google-vertex
```

## Purpose

- Test Vertex AI's Gemini, Claude, and Llama models
- Configure model-specific features and search grounding
- Compare performance across different tasks

## Prerequisites

- Google Cloud account with Vertex AI API enabled
- API credentials
- Node.js 18+

## Environment Variables

- `VERTEX_PROJECT_ID` - Your Google Cloud project ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account credentials (optional)

## Setup

1. Install dependencies:

   ```sh
   npm install google-auth-library
   ```

2. Configure authentication:

   ```sh
   # User account (development)
   gcloud auth application-default login

   # Or service account
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
   ```

3. Set your project ID:
   ```sh
   export VERTEX_PROJECT_ID=your-project-id
   ```

## Configurations

This example includes:

- `promptfooconfig.gemini.yaml`: Gemini models with function calling, system instructions, and safety settings
- `promptfooconfig.claude.yaml`: Claude models for technical writing and code analysis
- `promptfooconfig.llama.yaml`: Llama models with safety features and region configuration
- `promptfooconfig.search.yaml`: Search grounding for real-time information

## Running Examples

```sh
# Basic example
promptfoo eval -c promptfooconfig.yaml

# Model-specific examples
promptfoo eval -c promptfooconfig.gemini.yaml
promptfoo eval -c promptfooconfig.claude.yaml
promptfoo eval -c promptfooconfig.llama.yaml
promptfoo eval -c promptfooconfig.search.yaml

# View results
promptfoo view
```

## Expected Results

Each configuration demonstrates different model capabilities, from function calling and tool use to safety features and real-time information retrieval.

## Learn More

- [Vertex AI Provider Documentation](https://www.promptfoo.dev/docs/providers/vertex/)
- [Google Cloud Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Google documentation on Grounding with Google Search](https://ai.google.dev/docs/gemini_api/grounding)
