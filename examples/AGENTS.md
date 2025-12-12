# Examples

Self-contained example configurations for `npx promptfoo@latest init --example <name>`.

## CRITICAL: Test with Local Build

```bash
# Correct - tests your changes
npm run local -- eval -c examples/my-example/promptfooconfig.yaml

# Wrong - tests published version
npx promptfoo@latest eval
```

## Example Structure

Each example needs:

1. Directory with clear name
2. `README.md` starting with `# folder-name (Human Readable Name)`
3. `promptfooconfig.yaml` with schema reference
4. Instructions using `npx promptfoo@latest init --example <name>`

## Configuration Format

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: Short description (3-10 words)
prompts:
  - ...
providers:
  - ...
tests:
  - ...
```

**Field order:** description, env, prompts, providers, defaultTest, scenarios, tests

## Model Selection

Use current model identifiers (see `site/docs/providers/` for full list):

- OpenAI: `openai:responses:gpt-5.1`, `openai:responses:gpt-5.1-mini`
- Anthropic: `anthropic:messages:claude-sonnet-4-5-20250929`
- Google: `google:gemini-3-pro-preview`, `google:gemini-2.5-flash`

## Guidelines

- Keep examples simple while demonstrating the concept
- Use `file://` prefix for external files
- Make test cases engaging, not boring
- Document required environment variables in README
- Test examples before submitting
