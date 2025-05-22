# Claude 4 Migration Guide for Promptfoo

This guide helps you migrate from previous Claude models to the new Claude 4 models in Promptfoo.

## What's New

Promptfoo now supports the latest Claude 4 models:
- **Claude Opus 4** (`claude-opus-4-20250514`) - Most capable and intelligent model
- **Claude Sonnet 4** (`claude-sonnet-4-20250514`) - High-performance model with exceptional reasoning

The default Anthropic model in Promptfoo is now `claude-sonnet-4-20250514`.

## Migration Steps

### 1. Update Your Configuration Files

Replace old model names with Claude 4 models:

```yaml
# Before
providers:
  - anthropic:claude-3-7-sonnet-20250219
  - anthropic:claude-3-5-sonnet-20241022

# After
providers:
  - anthropic:claude-sonnet-4-20250514  # Claude Sonnet 4
  - anthropic:claude-opus-4-20250514    # Claude Opus 4
```

### 2. Use Aliases for Convenience

You can use aliases that automatically point to the latest versions:

```yaml
providers:
  - anthropic:claude-opus-4-latest    # Points to claude-opus-4-20250514
  - anthropic:claude-sonnet-4-latest  # Points to claude-sonnet-4-20250514
```

### 3. Update Cross-Platform Configurations

If using Claude models across different platforms:

| Platform      | Claude Opus 4                           | Claude Sonnet 4                           |
| ------------- | --------------------------------------- | ----------------------------------------- |
| Anthropic API | `claude-opus-4-20250514`                | `claude-sonnet-4-20250514`                |
| AWS Bedrock   | `anthropic.claude-opus-4-20250514-v1:0` | `anthropic.claude-sonnet-4-20250514-v1:0` |
| GCP Vertex AI | `claude-opus-4@20250514`                | `claude-sonnet-4@20250514`                |

### 4. Key Differences

#### Extended Thinking
Claude 4 supports summarized thinking for better reasoning:

```yaml
providers:
  - id: anthropic:claude-sonnet-4-20250514
    config:
      thinking:
        type: 'enabled'
        budget_tokens: 16000
      max_tokens: 32000
```

#### Output Capabilities
- Claude Opus 4: Max 32,000 output tokens
- Claude Sonnet 4: Max 64,000 output tokens
- The `output-128k-2025-02-19` beta feature is no longer needed for Claude 4

#### Pricing
Claude 4 models have updated pricing:
- **Claude Opus 4**: $15/MTok input, $75/MTok output
- **Claude Sonnet 4**: $3/MTok input, $15/MTok output

### 5. Testing Your Migration

After updating, test your configurations:

```bash
promptfoo eval -c your-config.yaml
```

### 6. Performance Considerations

- **Claude Opus 4**: Best for complex tasks requiring deep analysis
- **Claude Sonnet 4**: Balanced performance for most use cases
- Both models show improved reasoning and tool use accuracy

### Common Migration Issues

1. **Old beta headers**: Remove `output-128k-2025-02-19` and `token-efficient-tools-2025-02-19` - these are not supported in Claude 4
2. **Text editor tool**: Update tool type from `text_editor_20250124` to `text_editor_20250429`
3. **Refusal handling**: Update your code to handle the new `refusal` stop reason

### Need Help?

- Check the [Anthropic documentation](site/docs/providers/anthropic.md)
- Run tests with `promptfoo eval --verbose` for detailed debugging
- File issues at https://github.com/promptfoo/promptfoo/issues 