# variable-optimizer

The Variable Optimizer automatically improves prompt variables until your tests pass. It starts with an initial variable, tests it against your assertions, analyzes failures, and generates better values iteratively until your assertions pass or the maximum number of turns are reached.

You can run this example with:

```bash
npx promptfoo@latest init --example variable-optimizer
```

## Prerequisites

- OpenAI API key (set `OPENAI_API_KEY` environment variable)

## Two Examples

### 1. Translation Optimization (`promptfooconfig.basic.yaml`)

**Task**: Find English phrases that translate to French containing specific keywords.

**Example**: Start with `'Translate the following to French: {{text}}'` where text is `Good morning"` with assertions 'equals goodbye', analyze the output, update the value of text until

### 2. Content Moderation Testing (`promptfooconfig.content-filter.yaml`)

**Task**: Test if prompt injections can bypass content moderation.

**Example**: Try to make hate speech classify as "safe" using injection prompts.
**Goal**: Validate that your moderation system resists manipulation attempts.

## Running the Examples

**Basic Translation**:

```bash
npx promptfoo@latest eval -c examples/variable-optimizer/promptfooconfig.basic.yaml
```

**Content Moderation**:

```bash
npx promptfoo@latest eval -c examples/variable-optimizer/promptfooconfig.content-filter.yaml
```

## Customization

- Change `targetVariable` to optimize different variables
- Adjust `maxTurns` for more optimization attempts
- Use different models for `improverModel`
- Add custom assertions to test specific requirements
