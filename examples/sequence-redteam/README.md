# Sequence Provider Example

This example demonstrates how to use the sequence provider for testing multi-turn redteam scenarios. The sequence provider allows you to:
- Chain multiple prompts together in a conversation
- Test different redteam strategies (crescendo, jailbreak, prompt-injection)
- Maintain context between conversation turns
- Evaluate responses against ethical boundaries

## Configuration

The example uses the following key configurations:

```yaml
providers:
  - id: sequence
    config:
      targetProvider: openai:gpt-4  # The base provider to test against
      strategy: crescendo           # The redteam strategy to use
      maxTurns: 3                  # Maximum number of conversation turns
      systemPrompt: ...            # System prompt for the conversation
```

## Test Cases

1. Basic crescendo strategy test:
   - Tests how the model responds to increasingly complex security questions
   - Evaluates ethical boundaries using llm-rubric
   - Verifies focus on defensive security practices

2. Alternative strategy test:
   - Uses jailbreak strategy with fewer turns
   - Tests model's response to network security questions
   - Ensures focus remains on defensive measures

## Running the Example

```bash
promptfoo eval -c promptfooconfig.yaml
```

## Expected Behavior

The sequence provider will:
1. Start with the initial user prompt
2. Generate follow-up prompts based on the chosen strategy
3. Maintain conversation context between turns
4. Evaluate responses against the defined assertions

The example demonstrates how to use the sequence provider for thorough testing of your model's behavior in multi-turn conversations while maintaining ethical boundaries.
