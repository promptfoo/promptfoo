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
# ✅ CORRECT - Tests your changes
npm run local -- eval -c examples/my-example/promptfooconfig.yaml

# ❌ WRONG - Tests published version
npx promptfoo@latest eval
```

## Key Requirements

Every example needs:

1. **README.md** starting with `# folder-name (Human Readable Name)`
2. **promptfooconfig.yaml** with schema reference and specific field order
3. Instructions showing `npx promptfoo@latest init --example <name>`

**Field order in config (STRICT):**

1. `description` (SHORT - 3-10 words)
2. `env` (optional, rarely needed)
3. `prompts`
4. `providers`
5. `defaultTest` (optional)
6. `scenarios` (optional)
7. `tests`

## Quick Reference

- Use latest models: `openai:gpt-5`, `anthropic:claude-4.5-sonnet`
- Make test cases fun/engaging, not boring
- Use `file://` prefix for external files
- Keep descriptions SHORT (3-10 words)

## Complete Guidelines

See `.cursor/rules/examples.mdc` for comprehensive example standards.
