# Bedrock

The `bedrock` lets you use Amazon Bedrock in your evals. This is a common way to access Anthropic's Claude, Meta's Llama 3.1, AI21's Jamba, and other models. The complete list of available models can be found [here](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns).

## Setup

1. Ensure you have access to the desired models under the [Providers](https://console.aws.amazon.com/bedrock/home) page in Amazon Bedrock.

2. Install `@aws-sdk/client-bedrock-runtime`:

   ```sh
   npm install -g @aws-sdk/client-bedrock-runtime
   ```

3. The AWS SDK will automatically pull credentials from the following locations:

   - IAM roles on EC2
   - `~/.aws/credentials`
   - `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables

   See [setting node.js credentials (AWS)](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) for more details.

4. Edit your configuration file to point to the AWS Bedrock provider. Here's an example:

   ```yaml
   providers:
     - id: bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0
   ```

   Note that the provider is `bedrock:` followed by the [ARN/model id](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns) of the model.

5. Additional config parameters are passed like so:

   ```yaml
   providers:
     - id: bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0
       config:
         region: 'us-west-2'
         temperature: 0.7
         max_tokens: 256
   ```

## Example

See [Github](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) for full examples of Claude, AI21, Llama 3.1, and Titan model usage.

```yaml
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: bedrock:meta.llama3-1-405b-instruct-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:ai21.jamba-1-5-large-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:anthropic.claude-3-5-sonnet-20240620-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256

tests:
  - vars:
      topic: Our eco-friendly packaging
  - vars:
      topic: A sneak peek at our secret menu item
  - vars:
      topic: Behind-the-scenes at our latest photoshoot
```

## Model-specific Configuration

Different models may support different configuration options. Here are some model-specific parameters:

### AI21 Models

For AI21 models (e.g., `ai21.jamba-1-5-mini-v1:0`, `ai21.jamba-1-5-large-v1:0`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  top_p: 0.9
  frequency_penalty: 0.5
  presence_penalty: 0.3
```

### Claude Models

For Claude models (e.g., `anthropic.claude-3-5-sonnet-20240620-v1:0`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  anthropic_version: 'bedrock-2023-05-31'
  tools: [...] # Optional: Specify available tools
  tool_choice: { ... } # Optional: Specify tool choice
```

### Titan Models

For Titan models (e.g., `amazon.titan-text-express-v1`), you can use the following configuration options:

```yaml
config:
  maxTokenCount: 256
  temperature: 0.7
  topP: 0.9
  stopSequences: ['END']
```

### Llama

For Llama models (e.g., `meta.llama3-1-70b-instruct-v1:0`), you can use the following configuration options:

```yaml
config:
  max_gen_len: 256
  temperature: 0.7
  top_p: 0.9
```

### Cohere Models

For Cohere models (e.g., `cohere.command-text-v14`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  p: 0.9
  k: 0
  stop_sequences: ['END']
```

### Mistral Models

For Mistral models (e.g., `mistral.mistral-7b-instruct-v0:2`), you can use the following configuration options:

```yaml
config:
  max_tokens: 256
  temperature: 0.7
  top_p: 0.9
  top_k: 50
```

## Model-graded tests

You can use Bedrock models to grade outputs. By default, model-graded tests use OpenAI and require the `OPENAI_API_KEY` environment variable to be set. However, when using AWS Bedrock, you have the option of overriding the grader for [model-graded assertions](/docs/configuration/expected-outputs/model-graded/) to point to AWS Bedrock or other providers.

Note that because of how model-graded evals are implemented, **the LLM grading models must support chat-formatted prompts** (except for embedding or classification models).

To set this for all your test cases, add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider:
      id: provider:chat:modelname
      config:
        temperature: 0
        # Other provider config options
```

You can also do this for individual assertions:

```yaml
# ...
assert:
  - type: llm-rubric
    value: Do not mention that you are an AI or chat assistant
    provider:
      text:
        id: provider:chat:modelname
        config:
          region: us-east-1
          temperature: 0
          # Other provider config options...
```

Or for individual tests:

```yaml
# ...
tests:
  - vars:
      # ...
    options:
      provider:
        id: provider:chat:modelname
        config:
          temperature: 0
          # Other provider config options
    assert:
      - type: llm-rubric
        value: Do not mention that you are an AI or chat assistant
```

## Embeddings

To override the embeddings provider for all assertions that require embeddings (such as similarity), use `defaultTest`:

```yaml
defaultTest:
  options:
    provider:
      embedding:
        id: bedrock:embeddings:amazon.titan-embed-text-v2:0
        config:
          region: us-east-1
```

## Environment Variables

The following environment variables can be used to configure the Bedrock provider:

- `AWS_BEDROCK_REGION`: Default region for Bedrock API calls
- `AWS_BEDROCK_MAX_TOKENS`: Default maximum number of tokens to generate
- `AWS_BEDROCK_TEMPERATURE`: Default temperature for generation
- `AWS_BEDROCK_TOP_P`: Default top_p value for generation
- `AWS_BEDROCK_STOP`: Default stop sequences (as a JSON string)
- `AWS_BEDROCK_FREQUENCY_PENALTY`: Default frequency penalty (for supported models)
- `AWS_BEDROCK_PRESENCE_PENALTY`: Default presence penalty (for supported models)

Model-specific environment variables:

- `MISTRAL_MAX_TOKENS`, `MISTRAL_TEMPERATURE`, `MISTRAL_TOP_P`, `MISTRAL_TOP_K`: For Mistral models
- `COHERE_TEMPERATURE`, `COHERE_P`, `COHERE_K`, `COHERE_MAX_TOKENS`: For Cohere models

These environment variables can be overridden by the configuration specified in the YAML file.
