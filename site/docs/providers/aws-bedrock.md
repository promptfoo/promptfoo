# Bedrock

The `bedrock` lets you use Amazon Bedrock in your evals. This is a common way to access Anthropic's Claude, Meta's Llama 3.1, AI21's Jamba, and other models. The complete list of available models can be found [here](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns).

## Setup

1. Install the AWS SDK for JavaScript v3:

   ```sh
   npm install @aws-sdk/client-bedrock-runtime
   ```

2. Make sure you have valid AWS credentials configured. You can do this by setting the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables, or by using the AWS CLI to configure your credentials.

3. Enable the models you want to use in the AWS Bedrock console.

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
  - id: bedrock:ai21.jamba-1-5-mini-v1:0
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

For Llama models (e.g., `meta.llama2-13b-chat-v1`), you can use the following configuration options:

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

You can use Bedrock models to grade outputs. For example:

```yaml
providers:
  - id: bedrock:anthropic.claude-3-sonnet-20240229-v1:0
    config:
      temperature: 0
  - id: bedrock:anthropic.claude-instant-v1
    config:
      temperature: 1

prompts: [prompt.txt]

tests:
  - vars:
      topic: AI
  - vars:
      topic: Machine Learning

rubric: |
  Grade the tweet on a scale of 1-10 based on the following criteria:
  - Relevance to the topic
  - Engagement potential
  - Clarity and conciseness
  Provide a single number as output with no explanation.

assertion:
  - type: llm-rubric
    value:
      provider: bedrock:anthropic.claude-3-sonnet-20240229-v1:0
      rubric: $rubric
```

## Embeddings

To use Bedrock for embeddings, use the `bedrock-embedding:` prefix followed by the model name. For example:

```yaml
providers:
  - bedrock-embedding:amazon.titan-embed-text-v1
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
