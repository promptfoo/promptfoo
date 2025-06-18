# Variable Optimization Example - Basic Usage

This example demonstrates how to use the **Variable Optimizer** provider to automatically improve variable values within your prompts until test assertions pass.

The optimizer analyzes assertion failures and learns from previous attempts to suggest better variable values.

## Quick Start

```bash
npx promptfoo@latest init --example optimizer-basic
```

## What it does

Instead of manually tweaking variable values, the optimizer automatically:

1. Tests your current variable value against assertions
2. Analyzes why assertions failed
3. Suggests improved variable values
4. Repeats until all tests pass

## Simple Example

**Prompt template:** `'Translate the following to French: {{text}}'`  
**Current variable:** `text: "Hello world"`  
**Assertion:** Must contain "bonjour"

If "Hello world" → "Bonjour le monde" doesn't contain "bonjour", the optimizer might try:

- `text: "Hello friend"` → "Bonjour ami" ✅

## How it works

The variable optimizer follows this process:

1. **Takes your fixed prompt template** (e.g., `'Translate the following to French: {{text}}'`)
2. **Identifies the target variable** to optimize (e.g., `text`)
3. **Tests against your assertions** to see what fails
4. **Analyzes failure reasons** to understand what the test needs
5. **Learns from previous attempts** to avoid repeating failures
6. **Iteratively improves** the variable value until assertions pass
7. **Returns the best result** with optimized variables

## Key Features

### 🎯 **Assertion-Focused**

- Analyzes specific assertion failures (contains, JSON schema, etc.)
- Understands what each test is actually looking for
- Targets optimization toward assertion requirements

### 📈 **Progressive Learning**

- **Attempts 1-2**: Direct fixes based on assertion failure messages
- **Attempts 3-4**: Contextual and structural modifications
- **Attempts 5+**: Creative reframing and alternative approaches

### 🧠 **Failure Pattern Recognition**

- Remembers what hasn't worked in previous attempts
- Identifies patterns in failed approaches
- Adapts strategy based on optimization history

## Prerequisites

- OpenAI API key (set `OPENAI_API_KEY` environment variable)

## Running this example

```bash
npx promptfoo@latest init --example optimizer-basic
```

Or run it locally:

```bash
npm run local -- eval -c examples/optimizer-basic/promptfooconfig.yaml
```

## Configuration

The example demonstrates optimization across varying difficulty levels:

- **Target Variable**: `text` - The English phrase to be translated
- **Max Turns**: 3-4 optimization attempts per test
- **Improver Model**: Uses `openai:gpt-4o` for generating improvements
- **Learning**: Each failure informs the next attempt

## Test Cases

1. **"Hello world"** → should contain "bonjour" (straightforward)
2. **"Good morning"** → should contain "matin" (requires morning context)
3. **"Thank you very much"** → should contain "merci" (straightforward)
4. **"I like animals"** → should contain "chat" (needs specific animal)
5. **"The weather is nice today"** → should contain "nuit" (requires complete reframing)

## Expected Output

For each test case, you'll see:

1. **Initial attempt** with original variable value
2. **Assertion failure** explaining what's missing
3. **Optimized attempts** with improved variable values
4. **Success** when assertions finally pass

Example output:

```
Attempt 1: "I like animals" → "J'aime les animaux" (missing "chat")
Attempt 2: "I like cats" → "J'aime les chats" ✅ (contains "chat")
```

## Customization

You can customize this example by:

- **Changing `targetVariable`** to optimize different variables
- **Adding complex assertions** to test optimization capabilities
- **Using different `improverModel`** providers
- **Adjusting `maxTurns`** for more/fewer optimization attempts
- **Creating custom templates** for specific optimization strategies

## Advanced Usage

For more complex optimization scenarios, see:

- [Content Moderation Testing](../optimizer-content-moderation/) - Multi-assertion testing
- [Variable Optimizer Provider Documentation](../../site/docs/providers/prompt-optimizer.md) - Full configuration options
