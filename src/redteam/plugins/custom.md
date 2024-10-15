---
sidebar_label: Custom Plugin
---

# Custom Plugin

The Custom Plugin allows you to define your own red teaming plugin with custom generator and grader logic. This flexibility enables you to create specialized tests tailored to your specific AI system and security requirements.

## Purpose

The Custom Plugin helps to:

1. Create specialized red teaming scenarios not covered by existing plugins.
2. Implement organization-specific security and compliance checks.
3. Tailor the testing process to unique use cases or industry requirements.

## Configuration

To include the Custom Plugin in your LLM red teaming setup, create a JSON file with your custom plugin definition and reference it in your configuration:

```yaml
redteam:
  plugins:
    - id: 'custom'
      filePath: './path/to/your/custom-plugin.json'
```
The custom plugin JSON file should have the following structure:

```json
{
  "generator": "Your custom generator logic here",
  "grader": "Your custom grader logic here"
}
```

## How It Works

The Custom Plugin loads the plugin definition from the specified JSON file and uses it to generate test cases and grade responses.

1. Generator: The `generator` field in your JSON file should contain a string template that defines how to generate test prompts.
2. Grader: The `grader` field should contain a string template that defines how to evaluate the AI's responses.

Both the generator and grader can use Nunjucks templating for dynamic content.

## Implementation Details

The Custom Plugin is implemented in the `CustomPlugin` class:


```40:63:promptfoo/src/redteam/plugins/custom.ts
  private definition: CustomPluginDefinition;

  constructor(provider: ApiProvider, purpose: string, injectVar: string, filePath: string) {
    super(provider, purpose, injectVar);
    this.definition = loadCustomPluginDefinition(filePath);
  }

  protected async getTemplate(): Promise<string> {
    return this.definition.generator;
  }

  protected getAssertions(prompt: string): Assertion[] {
    const nunjucks = getNunjucksEngine();
    const renderedGrader = nunjucks.renderString(this.definition.grader, { purpose: this.purpose });

    return [
      {
        type: 'llm-rubric',
        value: renderedGrader,
      },
    ];
  }
}
```


The plugin uses a schema to validate the custom plugin definition:


```11:15:promptfoo/src/redteam/plugins/custom.ts
  .object({
    generator: z.string().min(1, 'Generator must not be empty').trim(),
    grader: z.string().min(1, 'Grader must not be empty').trim(),
  })
  .strict();
```


## Best Practices

1. Thoroughly test your custom generator and grader logic before deployment.
2. Use clear and descriptive names for your custom plugin files.
3. Document the purpose and expected behavior of your custom plugins.
4. Regularly review and update custom plugins to ensure they remain relevant and effective.

## Limitations

- The effectiveness of the Custom Plugin depends on the quality and comprehensiveness of your custom logic.
- Complex custom logic may increase processing time for red teaming tests.
- Ensure that your custom logic doesn't introduce unintended biases or vulnerabilities.

## Importance in Gen AI Red Teaming

The Custom Plugin is crucial for:

- Addressing unique security concerns specific to your AI system or industry.
- Implementing specialized tests that go beyond standard red teaming scenarios.
- Adapting your red teaming strategy to evolving threats and requirements.

By incorporating the Custom Plugin in your LLM red teaming strategy, you can create a more comprehensive and tailored security testing process for your AI system.

## Related Concepts

- [Policy Plugin](policy.md)
- [PII Plugin](pii.md)
- [Harmful Content Plugin](harmful.md)

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.