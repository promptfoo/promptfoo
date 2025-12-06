# Examples

**What this is:** Self-contained example configurations users can run with `npx promptfoo@latest init --example <name>`.

## Purpose

- **Onboarding** - Help new users learn promptfoo
- **Documentation** - Show features in action
- **Testing** - Validate features work
- **Marketing** - Demonstrate capabilities

## Critical: Test with Local Build

When developing examples, ALWAYS test with local build:

```bash
# Correct - Tests your changes
npm run local -- eval -c examples/my-example/promptfooconfig.yaml

# Wrong - Tests published version
npx promptfoo@latest eval
```

## Example Structure

Each example should have:

1. **Directory** with clear, descriptive name
2. **README.md** starting with `# folder-name (Human Readable Name)`
3. **promptfooconfig.yaml** with schema reference
4. Instructions showing `npx promptfoo@latest init --example <name>`

## Configuration File Structure

Always include the YAML schema reference:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
```

**Field order (STRICT):**

1. `description` - SHORT (3-10 words)
2. `env` (optional) - Rarely needed
3. `prompts`
4. `providers`
5. `defaultTest` (optional)
6. `scenarios` (optional)
7. `tests`

## Model Selection

Use latest model versions:

- OpenAI: `openai:responses:gpt-5.1`, `openai:responses:gpt-5-mini` (prefer responses API over chat)
- Anthropic: `anthropic:claude-sonnet-4-5-latest`
- Google: `google:gemini-3-pro-preview`, `google:gemini-2.5-flash`
- Include mix of providers when comparing performance

## Quick Reference

- Use `file://` prefix for external files
- Keep descriptions SHORT (3-10 words)
- Make test cases fun/engaging, not boring
- Ensure all configs pass YAML lint validation

## Environment Variables

List required environment variables in README:

```markdown
## Environment Variables

This example requires:

- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key
```

## Configuration Examples

### Basic Example

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: A simple evaluation of translation quality
prompts:
  - Translate "{{input}}" to {{language}}
providers:
  - openai:responses:gpt-5-mini
  - anthropic:claude-sonnet-4-5-latest
tests:
  - vars:
      input: Hello, world!
      language: French
    assert:
      - type: contains
        value: Bonjour
```

### Example with Optional Fields

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Evaluating joke quality across models
env:
  TEMPERATURE: 0.7
prompts:
  - file://prompts/joke_prompt.txt
providers:
  - id: gpt-5.1-creative
    provider: openai:responses:gpt-5.1
    temperature: $TEMPERATURE
  - anthropic:claude-sonnet-4-5-latest
defaultTest:
  assert:
    - type: javascript
      value: return output.length > 20 ? 'pass' : 'fail'
tests:
  - vars:
      topic: computers
      style: dad joke
    assert:
      - type: llm-rubric
        value: Rate this joke on a scale of 1-10 for humor
```

## Quality Guidelines

- Keep examples simple while demonstrating the concept
- Use publicly available APIs when possible
- Document required API keys or credentials
- Include placeholder values for secrets
- Test examples before submitting changes

## Maintenance

- Review examples periodically to ensure they work
- Update when APIs or dependencies change
- Update model versions when new ones become available
- Keep dependencies updated in example requirements files
