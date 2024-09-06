# Mistral AI Model Comparison Example with Promptfoo

This example demonstrates how to use Promptfoo to compare different Mistral AI models on their ability to explain complex scientific concepts in simple terms. For more information on configuring Promptfoo for use with Mistral AI, see the [Promptfoo documentation on the Mistral provider](https://www.promptfoo.dev/docs/providers/mistral).

## Prerequisites

1. **Promptfoo**: Ensure you have Promptfoo installed. If not, install it using npm:

   ```
   npm install -g promptfoo
   ```

2. **Mistral AI API Key**: You'll need an API key from Mistral AI. If you don't have one, sign up at [mistral.ai](https://mistral.ai/).

## Setup

1. **Set Mistral AI API Key**:

   Set your Mistral AI API key as an environment variable:

   ```
   export MISTRAL_API_KEY=your_api_key_here
   ```

2. **Configuration Files**:

   This directory contains two important configuration files:

   - `promptfooconfig.yaml`: Defines the Mistral models to compare, test cases, and evaluation criteria.
   - `prompt.yaml`: Contains the prompt template for the scientific explanations.

   Review these files to understand the setup and feel free to modify them as needed.

## Usage

1. **Run Evaluation**:

   ```
   npx promptfoo eval
   ```

2. **View Results**:

   ```sh
   npx promptfoo view
   ```

This will execute the tests defined in `promptfooconfig.yaml`, comparing the performance of different Mistral models on explaining various scientific concepts.
