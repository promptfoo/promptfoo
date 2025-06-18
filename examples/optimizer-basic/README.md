# optimizer-basic

This example demonstrates how to use the Prompt Optimizer provider to automatically improve variable values within your prompts until test assertions pass.

Unlike traditional prompt optimization that modifies the entire prompt, this approach keeps your prompt template fixed and iteratively optimizes specific variable values to achieve better results.

## How it works

The optimizer:
1. Takes a fixed prompt template (e.g., `'Translate the following to French: {{text}}'`)
2. Identifies a target variable to optimize (e.g., `text`)
3. Tests the current variable value against your assertions
4. If tests fail, uses an LLM to suggest better variable values
5. Repeats until assertions pass or max turns reached
6. Returns the best result with optimized variables

## Prerequisites

- OpenAI API key (set `OPENAI_API_KEY` environment variable)

## Running this example

You can run this example with:

```bash
npx promptfoo@latest init --example optimizer-basic
```

Or run it locally:

```bash
npm run local -- eval -c examples/optimizer-basic/promptfooconfig.yaml
```

## Configuration

The example optimizes the `text` variable in a French translation prompt:

- **Target Variable**: `text` - The English phrase to be translated
- **Assertions**: Each test checks if the French translation contains specific words
- **Max Turns**: Limited to 3 optimization attempts per test
- **Improver Model**: Uses `openai:gpt-4o` to suggest better variable values

## Expected Output

For each test case, if the initial variable value doesn't pass the assertions, the optimizer will:

1. Try the original value (e.g., "Hello world")
2. If it fails to contain "Bonjour", ask GPT-4o to suggest a better English phrase
3. Test the improved value
4. Repeat until the French translation contains the required words

The results will show the optimization history and final optimized variables.

## Customization

You can customize this example by:

- Changing the `targetVariable` to optimize different variables
- Adding more complex assertions
- Using different models for the `improverModel`
- Providing custom optimization templates
- Adjusting `maxTurns` and `stallIterations` for different optimization strategies 