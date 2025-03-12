# Google Vertex Tools

This example demonstrates how to use [Vertex AI models](https://www.promptfoo.dev/docs/providers/vertex/) with function calling and tools.

## Quick Start

Initialize this example in a new directory:

```sh
promptfoo init --example google-vertex-tools
```

This creates three files:

- `promptfooconfig.yaml` - Your prompt testing configuration
- `tools.json` - Function definitions for tool calling
- `README.md` - This guide

## Prerequisites

1. Install the Google Auth Library:

   ```sh
   npm install google-auth-library
   ```

2. Enable the Vertex AI API in your Google Cloud project

3. Configure your Google Cloud project:

   ```sh
   gcloud config set project PROJECT_ID
   ```

4. Set up authentication using one of these methods:

   - Authenticate with your Google account:

     ```sh
     gcloud auth application-default login
     ```

   - Use a machine with an authorized service account
   - Use service account credentials file:

     1. Download your service account JSON
     2. Set the credentials path:

        ```sh
        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
        ```

## Running the Example

1. Review and customize the configuration in `promptfooconfig.yaml`

2. Run the eval:

   ```sh
   promptfoo eval
   ```

3. Examine the results:

   ```sh
   promptfoo view
   ```

## Learn More

- [Vertex AI Provider Documentation](https://www.promptfoo.dev/docs/providers/vertex/)
- [Google Cloud Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [promptfoo Documentation](https://www.promptfoo.dev/docs/)
