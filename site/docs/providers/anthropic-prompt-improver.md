---
sidebar_label: Anthropic Prompt Improver
---

# Anthropic Prompt Improver

The Anthropic Prompt Improver Provider enables automatic optimization of prompt variables using Anthropic's Claude model to iteratively refine your prompts until they satisfy test assertions.

This provider is particularly useful for complex prompt engineering scenarios where you need to satisfy multiple constraints or quality criteria simultaneously.

## Overview

The Anthropic Prompt Improver works by:

1. **Evaluating** your current prompt against defined test assertions
2. **Generating** improved versions of a target variable using Claude's reasoning capabilities
3. **Testing** each candidate improvement against your quality criteria
4. **Iterating** until all assertions pass or no further improvement can be found

Unlike static prompt optimization, this provider provides dynamic, AI-driven refinement that adapts to your specific test requirements.

## Configuration

To use the Anthropic Prompt Improver Provider, set the provider `id` to `promptfoo:anthropic:prompt-improver`:

```yaml
defaultTest:
  provider:
    id: promptfoo:anthropic:prompt-improver
    config:
      targetVariable: requirements
      maxTurns: 10
      numCandidates: 4
      stallIterations: 6
```

### Required Setup

You must also specify:
1. A **base provider** (the actual model that will generate outputs)
2. **Test assertions** (the criteria to optimize for)
3. **Target variable** (the prompt variable to optimize)

```yaml
providers:
  - openai:gpt-4.1  # Base model for generation

tests:
  - vars:
      story_prompt: "A dragon who lost their fire"
      requirements: "Make it engaging"  # This will be optimized
    assert:
      - type: icontains
        value: "Once upon a time"
      - type: llm-rubric
        value: "Story should have clear beginning, middle, and end"
```

## Configuration Options

| Option               | Type    | Default          | Description                                                             |
| -------------------- | ------- | ---------------- | ----------------------------------------------------------------------- |
| `targetVariable`     | string  | `"requirements"` | The prompt variable to optimize                                         |
| `maxTurns`           | number  | `10`             | Maximum number of improvement iterations                                |
| `numCandidates`      | number  | `4`              | Number of candidate improvements generated per iteration                |
| `stallIterations`    | number  | `6`              | Stop after this many rounds without improvement                         |
| `useExperimentalApi` | boolean | `false`          | Use Anthropic's experimental prompt improver API (requires beta access) |

## How It Works

### 1. Initial Evaluation
The provider starts by evaluating your prompt with the original target variable value:

```yaml
vars:
  requirements: "Make it engaging and creative"
```

It runs this through your base model and checks how many assertions pass.

### 2. Feedback Generation
For failed assertions, it creates specific feedback:

```
The output passed 2/4 criteria. Issues that need to be addressed:
1. Expected output to contain "Once upon a time"
2. Story should have a clear beginning, middle, and end with character development
```

### 3. Candidate Generation
Claude generates multiple improved versions of the target variable:

- **Candidate 1:** "Make it engaging and creative, begin with 'Once upon a time', and ensure it has a clear beginning, middle, and end."
- **Candidate 2:** "Create an imaginative tale that starts with 'Once upon a time' and features strong character development through a three-act structure."
- **Candidate 3:** "Write an engaging story that opens with 'Once upon a time' and follows a clear narrative arc with character growth."
- **Candidate 4:** "Craft a creative story beginning with 'Once upon a time' that demonstrates clear story structure and character development."

### 4. Candidate Evaluation
Each candidate is tested by:
1. Substituting it into the prompt
2. Running the full prompt through the base model
3. Evaluating the output against all assertions
4. Scoring based on how many assertions pass

### 5. Best Selection & Iteration
The highest-scoring candidate becomes the new target variable value, and the process repeats until:
- All assertions pass (perfect score)
- Maximum iterations reached
- No improvement for several consecutive rounds

## Example Use Cases

### Creative Writing Optimization

```yaml
prompts:
  - "Write a story about: {{prompt}}\n\nRequirements: {{requirements}}"

tests:
  - vars:
      prompt: "A robot learning to paint"
      requirements: "Make it emotional and inspiring"
    assert:
      - type: icontains
        value: "painting"
      - type: javascript
        value: "output.length >= 200"
      - type: llm-rubric
        value: "Story should evoke emotion and show character growth"
```

### SQL Query Generation

```yaml
prompts:
  - "Generate a SQL query for: {{task}}\n\nInstructions: {{instructions}}"

tests:
  - vars:
      task: "Find top customers by revenue"
      instructions: "Use proper SQL syntax"
    assert:
      - type: regex
        value: "SELECT.*FROM.*ORDER BY.*DESC"
      - type: icontains
        value: "SUM\\(|COUNT\\(|MAX\\("
      - type: javascript
        value: "!output.includes('syntax error')"
```

### Code Generation

```yaml
prompts:
  - "Write Python code to: {{task}}\n\nGuidelines: {{guidelines}}"

tests:
  - vars:
      task: "Calculate fibonacci sequence"
      guidelines: "Make it efficient and readable"
    assert:
      - type: icontains
        value: "def"
      - type: regex
        value: "return\\s+\\w+"
      - type: llm-rubric
        value: "Code should be well-documented and efficient"
```

## Advanced Features

### Experimental API Support

If you have access to Anthropic's experimental prompt improver API, you can enable it:

```yaml
config:
  useExperimentalApi: true
```

This uses Anthropic's specialized prompt improvement endpoint instead of general Claude completions, potentially providing better optimization.

### Custom Optimization Targets

You can optimize any variable in your prompt:

```yaml
prompts:
  - "{{system_message}}\n\nUser: {{user_input}}\n\nConstraints: {{constraints}}"

config:
  targetVariable: system_message  # Optimize the system message instead
```

### Multiple Assertion Types

The provider works with all Promptfoo assertion types:

```yaml
assert:
  - type: icontains          # Text must contain specific strings
    value: "expected phrase"
  - type: regex              # Text must match regex pattern
    value: "\\d{4}-\\d{2}-\\d{2}"
  - type: javascript         # Custom JavaScript validation
    value: "output.split(' ').length >= 50"
  - type: llm-rubric         # LLM-based quality assessment
    value: "Response should be professional and helpful"
  - type: equals             # Exact text matching
    value: "Expected exact output"
```

## Best Practices

### 1. Start with Clear Assertions
Define specific, testable criteria:

```yaml
# Good - specific and measurable
assert:
  - type: icontains
    value: "function"
  - type: javascript
    value: "output.includes('return') && output.includes('def')"

# Avoid - too vague
assert:
  - type: llm-rubric
    value: "Should be good code"
```

### 2. Use Appropriate Iteration Limits
Balance thoroughness with performance:

```yaml
config:
  maxTurns: 5        # For simple optimizations
  numCandidates: 3   # Faster but less exploration

# Or for complex scenarios:
config:
  maxTurns: 15       # More iterations
  numCandidates: 6   # More candidates per round
```

### 3. Monitor Performance
The provider tracks optimization metadata:

```javascript
// Access optimization results
const result = await promptfoo.evaluate(config);
console.log(result.metadata.improved);           // Was optimization successful?
console.log(result.metadata.finalScore);         // Final assertion score
console.log(result.metadata.finalRequirements);  // Optimized variable value
```

## Environment Variables

Set required API keys:

```bash
export ANTHROPIC_API_KEY=your_anthropic_key
export OPENAI_API_KEY=your_base_model_key  # If using OpenAI as base model
```

## Limitations

- **API Costs:** Each iteration makes multiple API calls (1 for feedback + N candidates + N evaluations)
- **Base Model Required:** You must specify a base model provider for actual output generation
- **Single Variable:** Currently optimizes one variable at a time
- **Assertion Dependency:** Effectiveness depends on quality of your test assertions
- **Iterative Process:** Can be slower than direct prompt evaluation

## Debugging

Enable debug logging to see the optimization process:

```bash
LOG_LEVEL=debug promptfoo eval
```

This shows:
- Initial assessment results
- Generated feedback for each iteration
- Candidate improvements being tested
- Scores for each candidate
- Final optimization outcome

## Integration with Other Providers

The prompt improver works with any base provider:

```yaml
providers:
  - openai:gpt-4.1
  - anthropic:claude-3-5-sonnet
  - azure:gpt-4
  - vertex:gemini-pro

defaultTest:
  provider:
    id: promptfoo:anthropic:prompt-improver
    config:
      targetVariable: instructions
```

## Example Output

Original requirements: `"Make it engaging and creative"`

Optimized requirements: `"Create an imaginative, detailed story that begins with 'Once upon a time', features compelling character development through a clear three-act structure with beginning, middle, and end, and maintains an engaging narrative voice throughout while staying within 200-500 characters."`

The optimization process automatically transforms vague instructions into specific, actionable requirements that satisfy all your test criteria.

## See Also

- [Simulated User Provider](./simulated-user) - For conversation optimization
- [Assertions Guide](../assertions) - For writing effective test criteria
- [Examples Repository](https://github.com/promptfoo/promptfoo/tree/main/examples/anthropic-prompt-improver) - Complete working examples 