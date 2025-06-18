# optimizer-basic

This example demonstrates how to use the **Strategic Prompt Optimizer** provider to automatically **intelligently rewrite variable values** within your prompts until test assertions pass.

The optimizer uses **strategic intelligence** and **learns from optimization history** to make increasingly better variable suggestions.

## How it works

The strategic optimizer:

1. Takes a fixed prompt template (e.g., `'Translate the following to French: {{text}}'`)
2. Identifies a target variable to optimize (e.g., `text`)
3. Tests the current variable value against your assertions
4. **Analyzes the full optimization history** to understand what has failed and why
5. **Uses strategic thinking** to choose different approaches based on failure patterns
6. **Escalates creativity** - starts with obvious solutions, then gets more creative if needed
7. Repeats until assertions pass or max turns reached
8. Returns the best result with the strategically optimized variables

## Strategic Intelligence Features

### 🧠 **History Analysis**

- Sees all previous attempts, their outputs, scores, and failure reasons
- Understands patterns in what doesn't work
- Avoids repeating similar failed approaches

### 🎯 **Strategic Escalation**

- **Attempts 1-2**: Direct, obvious solutions
- **Attempts 3-4**: Creative but related approaches
- **Attempts 5+**: Completely different angles, indirect methods

### 🔍 **Failure-Specific Strategies**

- **Word-specific tests**: Tries phrases that naturally include target words
- **Semantic failures**: Switches domains or contexts
- **Translation challenges**: Uses phrases that force specific translations
- **All logic fails**: Tries creative/unexpected approaches

## Key concept

The optimizer **learns from failure patterns** and **strategically adapts**. For example:

- Original: `"The weather is nice today"`
- Strategic Analysis: "Need 'nuit' (night) but trying day-related phrases"
- Intelligent Rewrite: `"The night is beautiful"` → "La nuit est belle." ✅

It's not just rewriting - it's **strategic problem solving**.

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

The example demonstrates strategic optimization across varying difficulty levels:

- **Target Variable**: `text` - The English phrase to be translated
- **Strategic Analysis**: Each failure provides learning for the next attempt
- **Max Turns**: 3-4 optimization attempts per test with intelligent escalation
- **Strategic Model**: Uses `openai:gpt-4o` for sophisticated strategic analysis

## Expected Output

For each test case, the strategic optimizer will:

1. **Analyze History**: "What approaches have failed and why?"
2. **Choose Strategy**: "Based on attempt number and failure patterns, what approach should I try?"
3. **Execute Intelligently**: Generate contextually aware variable values
4. **Learn & Adapt**: Use each result to inform the next strategic decision

## Test Cases & Strategic Thinking

1. **"Hello world"** → should contain "bonjour" (direct success)
2. **"Good morning"** → should contain "matin" (strategic: "Early morning" to emphasize morning)
3. **"Thank you very much"** → should contain "merci" (direct success)
4. **"I like animals"** → should contain "chat" (strategic: "I like cats" to get specific animal)
5. **"The weather is nice today"** → should contain "nuit" (strategic: complete context switch to night)

## Customization

You can customize this example by:

- Changing the `targetVariable` to optimize different variables
- Adding more complex assertions to challenge the strategic thinking
- Using different models for the `improverModel`
- Providing custom strategic templates
- Adjusting `maxTurns` for different optimization complexity
- Testing with multiple sequential requirements to see advanced strategy
