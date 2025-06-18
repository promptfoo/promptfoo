# optimizer-basic

This example demonstrates how to use the Prompt Optimizer provider to automatically **rewrite variable values** within your prompts until test assertions pass.

The optimizer can **completely rewrite** variable values - it's not limited to small modifications. It will try entirely different content to achieve the test goals.

## How it works

The optimizer:

1. Takes a fixed prompt template (e.g., `'Translate the following to French: {{text}}'`)
2. Identifies a target variable to optimize (e.g., `text`)
3. Tests the current variable value against your assertions
4. If tests fail, uses an LLM to **completely rewrite** the variable value
5. Repeats until assertions pass or max turns reached
6. Returns the best result with the rewritten variables

## Key concept

The optimizer can **completely change** the variable content. For example:
- Original: `"Good morning"` 
- Rewritten: `"It's a beautiful morning"` (to ensure French translation contains "matin")

It's not limited to small tweaks - it will try entirely different approaches.

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

The example rewrites the `text` variable in a French translation prompt:

- **Target Variable**: `text` - The English phrase to be translated
- **Assertions**: Each test checks if the French translation contains specific words
- **Max Turns**: Limited to 3 rewrite attempts per test
- **Improver Model**: Uses `openai:gpt-4o` to suggest completely new variable values

## Expected Output

For each test case, if the initial variable value doesn't pass the assertions, the optimizer will:

1. Try the original value (e.g., "Good morning")
2. If it fails to contain "matin", ask GPT-4o to **completely rewrite** the English phrase
3. Test the rewritten value (e.g., "It's a beautiful morning")
4. Repeat until the French translation contains the required words

The results will show the optimization history and final rewritten variables.

## Test Cases

1. **"Hello world"** → should contain "bonjour" (might pass immediately)
2. **"Good morning"** → should contain "matin" (will likely need rewriting)
3. **"Thank you very much"** → should contain "merci" (might pass immediately)
4. **"I like animals"** → should contain "chat" (challenging - needs rewrite to mention cats)

## Customization

You can customize this example by:

- Changing the `targetVariable` to optimize different variables
- Adding more complex assertions
- Using different models for the `improverModel`
- Providing custom rewriting templates
- Adjusting `maxTurns` and `stallIterations` for different optimization strategies
