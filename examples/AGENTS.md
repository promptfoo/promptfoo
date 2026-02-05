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

## Environment Variables in Configs

Use Nunjucks template syntax to reference environment variables:

```yaml
# ✅ CORRECT - Nunjucks template syntax
accountId: '{{env.CLOUDFLARE_ACCOUNT_ID}}'
apiKey: '{{env.OPENAI_API_KEY}}'

# ❌ WRONG - Shell syntax doesn't work in YAML configs
accountId: ${CLOUDFLARE_ACCOUNT_ID}
apiKey: $OPENAI_API_KEY
```

Note: Quotes around `'{{env.VAR}}'` are required in YAML to prevent parsing issues.

## Model Selection

Use current model identifiers (see `site/docs/providers/` for full list):

- OpenAI: `openai:chat:gpt-5-mini`, `openai:chat:gpt-5.1-mini`, `openai:responses:gpt-5.2`
- Anthropic: `anthropic:messages:claude-sonnet-4-5-20250929`
- Google: `google:gemini-2.0-flash`, `google:gemini-2.5-pro-preview`

## Guidelines

- Keep examples simple while demonstrating the concept
- Use `file://` prefix for external files
- Make test cases engaging, not boring
- Document required environment variables in README
- Test examples before submitting
- **If adding example for a new provider**, verify docs exist at `site/docs/providers/<provider>.md`

## Chat Format Prompts

Some providers require specific message structures (e.g., exactly one system + one user message). Use a JSON file instead of inline YAML:

```json
// prompts/chat.json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "user", "content": "Help with: {{topic}}" }
]
```

```yaml
# promptfooconfig.yaml
prompts:
  - file://prompts/chat.json
```
