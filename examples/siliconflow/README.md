# siliconflow (SiliconFlow Models Integration)

This example demonstrates how to use SiliconFlow's large language models with promptfoo for testing and evaluation.

You can run this example with:

```bash
npx promptfoo@latest init --example siliconflow
```

## What is SiliconFlow?

SiliconFlow is a Chinese AI platform offering a variety of powerful models including Qwen, DeepSeek, GLM, and InternLM series. The platform provides OpenAI-compatible APIs that make it easy to integrate with existing applications.

## Prerequisites

- A SiliconFlow account (sign up at [cloud.siliconflow.cn](https://cloud.siliconflow.cn/))
- An API key from your SiliconFlow dashboard
- Node.js installed on your machine

## Environment Variables

This example requires the following environment variable:

- `SILICONFLOW_API_KEY` - Your SiliconFlow API key from the [account settings](https://cloud.siliconflow.cn/account/ak)

You can set this in a `.env` file or directly in your environment:

```bash
export SILICONFLOW_API_KEY=your_api_key_here
```

## Example Configurations

This example includes two configuration files:

1. **Basic Chat Example** (`chat_config.yaml`): Demonstrates basic usage of SiliconFlow models with different configuration options.

2. **Function Calling Example** (`function_calling_example.yaml`): Shows how to use SiliconFlow models with function calling capabilities.

## Running the Examples

To run the basic chat example:

```bash
npx promptfoo eval --config chat_config.yaml
```

To run the function calling example:

```bash
npx promptfoo eval --config function_calling_example.yaml
```

To view results in the web UI:

```bash
npx promptfoo view --config chat_config.yaml
```

## What to Expect

The examples will:

1. Connect to SiliconFlow API using your API key
2. Send test prompts to various SiliconFlow models
3. Test different features like JSON mode and function calling
4. Display the results for comparison

## Available Models

SiliconFlow offers a variety of models, including:

- Qwen series (e.g., `Qwen/Qwen2.5-72B-Instruct`, `Qwen/Qwen3-32B`)
- DeepSeek series (e.g., `deepseek-ai/DeepSeek-V2.5`, `deepseek-ai/DeepSeek-R1`)
- GLM series (e.g., `THUDM/GLM-4-32B-0414`)
- InternLM series (e.g., `internlm/internlm2_5-20b-chat`)

The examples use a selection of these models to demonstrate different capabilities.

## Further Resources

- [SiliconFlow Documentation](https://docs.siliconflow.cn/)
- [promptfoo Documentation](https://www.promptfoo.dev/docs/providers/siliconflow)
