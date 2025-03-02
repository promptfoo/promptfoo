# WatsonX Integration Example

This example demonstrates how to use promptfoo with IBM's WatsonX.ai platform for evaluating and testing foundation models. It showcases authentication options and model configurations.

## Quick Start

```bash
npx promptfoo@latest init --example watsonx
```

## Configuration

You can choose between two authentication methods:

### Option 1: IAM Authentication (Recommended)

```bash
export WATSONX_AI_AUTH_TYPE=iam
export WATSONX_AI_APIKEY=your-ibm-cloud-api-key
```

### Option 2: Bearer Token Authentication

```bash
export WATSONX_AI_AUTH_TYPE=bearertoken
export WATSONX_AI_BEARER_TOKEN=your-ibm-cloud-bearer-token
```

### Required Project Configuration

```bash
export WATSONX_AI_PROJECT_ID=your-ibm-project-id
```

Note: If `WATSONX_AI_AUTH_TYPE` is not set, the provider will automatically choose based on available credentials, preferring IAM authentication.

## Usage

Run the evaluation:

```bash
promptfoo eval
```

Or specify a custom configuration:

```bash
promptfoo eval --config examples/watsonx/promptfooconfig.yaml
```

View results:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates:

- Model response quality
- Parameter optimization
- Different foundation models available on WatsonX
- Authentication methods and configurations

## Example Structure

The example includes:

- `promptfooconfig.yaml`: Main configuration file
- Authentication setup examples
- Test cases and prompts
- Model-specific configurations

## Additional Resources

- [WatsonX.ai Documentation](https://www.ibm.com/docs/en/watsonx-as-a-service)
- [WatsonX Provider Guide](https://promptfoo.dev/docs/providers/watsonx)
- [IBM Cloud API Key Guide](https://cloud.ibm.com/docs/account?topic=account-userapikey)
- [Configuration Reference](https://promptfoo.dev/docs/configuration/)
