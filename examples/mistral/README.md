# Mistral AI Model Comparison Example

This example demonstrates how to use promptfoo to compare different Mistral AI models on their ability to explain complex scientific concepts in simple terms. It compares several chat models and uses the embedding model to compare the semantic similarity of the explanations.

## Prerequisites

You'll need an API key from Mistral AI. If you don't have one, sign up at [mistral.ai](https://mistral.ai/).

## Setup

1. Set your Mistral AI API key as an environment variable:

   ```sh
   export MISTRAL_API_KEY=your_api_key_here
   ```

2. Review the configuration files in this directory:
   - `promptfooconfig.yaml`: Defines the Mistral models to compare, test cases, and evaluation criteria.
   - `prompt.yaml`: Contains the prompt template for the scientific explanations.

## Usage

1. Run the evaluation:

   ```
   npx promptfoo eval
   ```

2. View the results:

   ```sh
   npx promptfoo view
   ```

This will compare the performance of different Mistral models on explaining various scientific concepts.

For more information on configuring promptfoo with Mistral AI, see the [Mistral provider documentation](https://www.promptfoo.dev/docs/providers/mistral).
