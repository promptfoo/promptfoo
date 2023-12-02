# Bedrock

The `bedrock` lets you use Amazon Bedrock in your evals.  This is a common way to access Anthropic's Claude and other models.

## Setup

First, install `@aws-sdk/client-bedrock-runtime`:

```sh
npm install -g @aws-sdk/client-bedrock-runtime
```

Then, set the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables.

Finally, edit your configuration file to point to the AWS Bedrock provider.  Here's an example:

```yaml
providers:
  - bedrock:completion:anthropic.claude-v1
```

Additional config parameters are passed like so:

```yaml
providers:
  - id: bedrock:completion:anthropic.claude-v1
    // highlight-start
    config:
      region: 'us-west-2'
      temperature: 0.7
      max_tokens_to_sample: 256
    // highlight-end
```

## Model-graded tests

If you are using AWS Bedrock, you must override the grader to point to your AWS Bedrock deployment for [model-graded assertions](/docs/configuration/expected-outputs/model-graded/).

The easiest way to do this for _all_ your test cases is to add the [`defaultTest`](/docs/configuration/guide/#default-test-cases) property to your config:

```yaml title=promptfooconfig.yaml
defaultTest:
  options:
    provider:
      id: bedrock:completion:anthropic.claude-v1
      config:
        region: 'us-west-2'
```

But you can also do this for individual assertions:

```yaml
# ...
assert:
  - type: llm-rubric
    value: Do not mention that you are an AI or chat assistant
    provider:
      id: bedrock:completion:anthropic.claude-v1
      config:
        region: 'us-west-2'
```

Or individual tests:

```yaml
# ...
tests:
  - vars:
      # ...
    options:
      provider:
        id: bedrock:completion:anthropic.claude-v1
        config:
          region: 'us-west-2'
    assert:
      - type: llm-rubric
        value: Do not mention that you are an AI or chat assistant
```
