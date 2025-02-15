# Google Vertex Tools

This example demonstrates how to use Vertex AI models with function calling and tools.

## Quick Start

To get started with this example, run:

```sh
promptfoo init --example google-vertex-tools
```

This will create a new directory containing:

- `promptfooconfig.yaml` - Configuration for your prompts and tests
- `tools.json` - Function definitions for the tools
- `README.md` - This documentation file

## Prerequisites

1. Install the required Google auth client:

   ```sh
   npm i google-auth-library
   ```

2. Enable the Vertex AI API in your Google Cloud project

3. Set your Google Cloud project:

   ```sh
   gcloud config set project PROJECT_ID
   ```

4. Authenticate with Google Cloud using one of these methods:

   - Log in with your user account:

     ```sh
     gcloud auth application-default login
     ```

   - Use a machine with a service account that has the appropriate role
   - Use service account credentials:

     1. Download the credentials JSON file
     2. Set the environment variable:

        ```sh
        export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
        ```

## Running the Example

1. Review and customize `promptfooconfig.yaml` for your use case

2. Run the eval:

   ```sh
   promptfoo eval
   ```

3. View the results:

   ```sh
   promptfoo view
   ```

## What's Next

- Check out the [Vertex AI documentation](https://cloud.google.com/vertex-ai/docs) to learn more about available models and features
