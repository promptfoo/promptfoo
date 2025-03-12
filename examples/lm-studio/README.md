# LM Studio Example with Promptfoo

This example demonstrates how to use Promptfoo with LM Studio for prompt evaluation. It showcases configuration for interacting with the LM Studio API using a locally hosted language model.

## Prerequisites

1. **LM Studio**: Install LM Studio from [lmstudio.ai](https://lmstudio.ai/).
2. **Model**: Download the `bartowski/gemma-2-9b-it-GGUF` model in LM Studio.

## Setup

1. **Start LM Studio Server**:

   - Open LM Studio and load the `bartowski/gemma-2-9b-it-GGUF` model.
   - Start a local server to host the model (usually at `http://localhost:1234`).

2. **Configure Promptfoo**:

   Create a `promptfooconfig.yaml` file with the following content:

   ```yaml
   providers:
     - id: 'http://localhost:1234/v1/chat/completions'
       config:
         method: 'POST'
         headers:
           'Content-Type': 'application/json'
         body:
           messages: '{{ prompt }}'
           model: 'bartowski/gemma-2-9b-it-GGUF'
           temperature: 0.7
           max_tokens: -1
         transformResponse: 'json.choices[0].message.content'
   ```

   Note that you can view the specific configuration for each model within LM Studio's examples in the server tab.

## Usage

1. **Run Evaluation**:

   ```
   npx promptfoo eval
   ```

2. **View Results**:

   ```sh
   npx promptfoo view
   ```

For more information, see the [Promptfoo documentation](https://www.promptfoo.dev/docs/providers/http) on how to set up a custom HTTP provider.
