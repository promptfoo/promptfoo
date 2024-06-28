# Bedrock

The `bedrock` lets you use Amazon Bedrock in your evals. This is a common way to access Anthropic's Claude and other models. The complete list of available models can be found [here](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns).

## Setup

First, ensure that you have access to the desired models under the [Providers](https://console.aws.amazon.com/bedrock/home) page in Amazon Bedrock.

Next, install `@aws-sdk/client-bedrock-runtime`:

```sh
npm install -g @aws-sdk/client-bedrock-runtime
```

The AWS SDK will automatically pull credentials from the following locations:

- IAM roles on EC2
- `~/.aws/credentials`
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables
- See [setting node.js credentials (AWS)](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) for more

Finally, edit your configuration file to point to the AWS Bedrock provider. Here's an example:

```yaml
providers:
  - bedrock:anthropic.claude-3-haiku-20240307-v1:0
```

Note that provider is `bedrock:` followed by the [ARN/model id](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#model-ids-arns) of the model.

Additional config parameters are passed like so:

```yaml
providers:
  - id: bedrock:anthropic.claude-3-haiku-20240307-v1:0
    // highlight-start
    config:
      region: 'us-west-2'
      temperature: 0.7
      max_tokens: 256
    // highlight-end
```

## Example

See [Github](https://github.com/promptfoo/promptfoo/tree/main/examples/amazon-bedrock) for full examples of Claude and Titan model usage.

```yaml
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - id: bedrock:anthropic.claude-instant-v1
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens_to_sample: 256
  - id: bedrock:anthropic.claude-3-haiku-20240307-v1:0
    config:
      region: 'us-east-1'
      temperature: 0.7
      max_tokens: 256
  - id: bedrock:anthropic.claude-3-sonnet-20240229-v1:0
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

## Model-graded tests

By default, model-graded tests use OpenAI and require the `OPENAI_API_KEY` environment variable to be set. When using AWS Bedrock, you have the option of overriding the grader for [model-graded assertions](/docs/configuration/expected-outputs/model-graded/) to point to AWS Bedrock, or other providers.

Note that because of how model-graded evals are implemented, **the LLM grading models must support chat-formatted prompts** (except for embedding or classification models).

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider:
      id: provider:chat:modelname
      config:
        # Provider config options
```

But you can also do this for individual assertions:

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
          # Other provider config options...
```

Or individual tests:

```yaml
# ...
tests:
  - vars:
      # ...
    options:
      provider:
        id: provider:chat:modelname
        config:
          # Provider config options
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
