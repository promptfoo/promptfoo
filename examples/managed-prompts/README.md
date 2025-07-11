# Managed Prompts Example

This example demonstrates how to use Promptfoo's managed prompts feature to version control and deploy prompts across your evaluation pipeline.

## What are Managed Prompts?

Managed prompts allow you to:
- Version control your prompts with full history
- Deploy specific versions to different environments (dev, staging, production)
- Reference prompts consistently across evaluations
- Track changes and collaborate with your team

## Quick Start

1. **Create a managed prompt**:
```bash
promptfoo prompt create customer-support --desc "Customer support agent prompt"
```

2. **Edit the prompt**:
```bash
promptfoo prompt edit customer-support
```

3. **Deploy to an environment**:
```bash
promptfoo prompt deploy customer-support production
```

4. **Run the evaluation**:
```bash
promptfoo eval
```

## Using Managed Prompts in Configs

Reference managed prompts using the `pf://` prefix:

```yaml
prompts:
  - pf://customer-support          # Uses current version
  - pf://customer-support:2         # Uses specific version
  - pf://customer-support:prod      # Uses production deployment
```

## Example Workflow

1. Create and iterate on prompts:
```bash
# Create initial version
promptfoo prompt create greeting --from-file greeting.txt

# Edit and create v2
promptfoo prompt edit greeting

# Compare versions
promptfoo prompt diff greeting 1 2

# Test the prompt
promptfoo prompt test greeting --provider openai:gpt-4o
```

2. Deploy to environments:
```bash
# Deploy v2 to staging
promptfoo prompt deploy greeting staging --version 2

# After testing, deploy to production
promptfoo prompt deploy greeting production --version 2
```

3. Use in evaluations:
```yaml
# promptfooconfig.yaml
prompts:
  - pf://greeting:staging   # Test staging version
  - pf://greeting:production # Compare with production
```

## Benefits

- **Consistency**: Same prompt version across all tests
- **Traceability**: Know exactly which prompt version was used
- **Collaboration**: Team members can work on prompts together
- **Safety**: Test changes in staging before production

## Local vs Cloud Mode

By default, prompts are stored locally in YAML files. To use cloud sync:

```bash
# Enable cloud mode
promptfoo auth login

# Or force local mode even when logged in
export PROMPTFOO_PROMPT_LOCAL_MODE=true
```

## Next Steps

- Run `promptfoo prompt --help` for all available commands
- Check out the [prompt management docs](https://promptfoo.dev/docs/prompts/management)
- Explore version control strategies for your prompts 