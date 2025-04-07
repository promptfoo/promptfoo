# lambdalabs

This example demonstrates how to use the Lambda Labs Inference API with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example lambdalabs
```

## Prerequisites

- A Lambda Labs Cloud account
- A Lambda Labs API key (generate from your [Lambda Cloud dashboard](https://cloud.lambdalabs.com/api-keys))

## Environment Variables

This example requires:

- `LAMBDA_API_KEY` - Your Lambda Labs Cloud API key

```bash
export LAMBDA_API_KEY=your_lambda_key_here
```

## Running the Example

1. Set your Lambda API key
2. Run the evaluation: `promptfoo eval`
3. View results: `promptfoo view`

## What This Example Tests

This example evaluates how well Lambda models can:

- Perform step-by-step reasoning for absurd estimation questions
- Make plausible calculations based on reasonable assumptions
- Provide entertaining yet mathematically sound responses
- Break down complex estimation problems

The evaluation compares Llama 4 Maverick (17B) with Llama 3.3 (70B) to see which performs better on these types of reasoning tasks.

## Model Information

- `llama-4-maverick-17b-128e-instruct-fp8` - Used for both generation and evaluation
- `llama3.3-70b-instruct-fp8` - Used for generation only

## Self-Evaluation

This example demonstrates self-evaluation by using the same Lambda Labs Llama 4 model to both generate answers and evaluate them against our rubric. This creates an end-to-end Lambda Labs workflow without needing external models for evaluation.

## Additional Resources

- [Lambda Labs API Documentation](https://docs.lambda.ai/public-cloud/lambda-inference-api/)
- [Lambda Labs Promptfoo Documentation](https://promptfoo.dev/docs/providers/lambdalabs)
- [Model-graded Metrics](https://promptfoo.dev/docs/configuration/expected-outputs/model-graded/)
