---
sidebar_position: 50
---

# Prompt Management

Promptfoo includes a comprehensive prompt management system that helps you version, track, and deploy your prompts across different environments.

## Overview

The prompt management system provides:

- **Version Control**: Track all changes to your prompts with full version history
- **Deployment Tracking**: Deploy specific versions to different environments (dev, staging, production)
- **Team Collaboration**: Multiple team members can work on prompts with author tracking
- **Evaluation Integration**: Test prompt versions against your evaluation suites
- **Dual Mode**: Works both locally (YAML files) and with cloud storage

## Getting Started

### Local vs Cloud Mode

The prompt management system works in two modes:

- **Local Mode**: Stores prompts as YAML files in your project directory (default when not logged into cloud)
- **Cloud Mode**: Stores prompts in the Promptfoo cloud (default when logged in via `promptfoo auth login`)

To force local mode even when logged into cloud, set the environment variable:
```bash
export PROMPTFOO_PROMPT_LOCAL_MODE=true
```

### CLI Commands

The `promptfoo prompt` command provides a complete interface for managing prompts:

```bash
# Create a new prompt
promptfoo prompt create customer-support --desc "Customer support agent prompt"

# List all prompts
promptfoo prompt list

# Show prompt details
promptfoo prompt show customer-support

# Edit a prompt (creates new version)
promptfoo prompt edit customer-support

# Compare versions
promptfoo prompt diff customer-support 1 2

# Deploy to environment
promptfoo prompt deploy customer-support production --version 3

# Run tests
promptfoo prompt test customer-support -t tests.yaml --provider openai:gpt-4

# Delete a prompt
promptfoo prompt delete customer-support --force
```

### Web UI

Access the prompt management UI at `http://localhost:15500/prompts` when running the Promptfoo server.

The UI provides:
- Visual prompt editor with syntax highlighting
- Version history browser
- Side-by-side version comparison
- Deployment management
- Quick testing interface

## Working with Prompts

### Creating Prompts

Create a new prompt using the CLI:

```bash
promptfoo prompt create my-assistant --desc "My AI assistant"
```

Or create from an existing file:

```bash
promptfoo prompt create my-assistant --from-file prompt.txt
```

#### Supported File Formats

The prompt management system supports all Promptfoo prompt formats when creating from files:

- **Text/Markdown** (`.txt`, `.md`): Simple text prompts with variable substitution
- **JSON** (`.json`, `.jsonl`): Chat conversations and structured prompts
- **CSV** (`.csv`): Multiple prompts with optional labels (imports first prompt)
- **YAML** (`.yaml`, `.yml`): Configuration-based prompts
- **Jinja2** (`.j2`): Advanced templating with conditional logic
- **Code** (`.js`, `.ts`, `.py`): Dynamic prompt generation functions

Example usage:
```bash
# From chat conversation JSON
promptfoo prompt create chat-agent --from-file templates/chat.json

# From CSV with multiple prompts
promptfoo prompt create email-templates --from-file templates/emails.csv

# From Jinja2 template
promptfoo prompt create dynamic-prompt --from-file templates/prompt.j2
```

#### Web UI File Upload

The web interface provides a convenient file upload feature:

1. Navigate to the prompts list and click "New Prompt"
2. Click the "Upload File" button in the prompt editor
3. Select a file in any supported format
4. The system will:
   - Parse the file content based on its extension
   - Auto-populate the prompt ID from the filename
   - Load the content into the editor
   - Show the source file and detected format
5. Review and adjust the content before saving

For CSV and JSON files containing multiple prompts, only the first prompt is imported. To manage multiple prompts, create them individually or use the bulk import feature.

### Prompt Format

Prompts support Nunjucks templating for variables:

```text
You are a helpful assistant for {{company}}.

User query: {{query}}

Please provide a {{tone}} response that addresses their needs.
```

### Version Management

Every edit creates a new version automatically:

```bash
# Edit prompt (opens in $EDITOR)
promptfoo prompt edit my-assistant

# View specific version
promptfoo prompt show my-assistant --version 2

# Compare versions
promptfoo prompt diff my-assistant 1 3
```

### Deployment

Deploy specific versions to environments:

```bash
# Deploy latest to production
promptfoo prompt deploy my-assistant production

# Deploy specific version
promptfoo prompt deploy my-assistant staging --version 5

# View deployment status
promptfoo prompt show my-assistant
```

## Local Mode (YAML Files)

By default, prompts are stored locally in YAML files at `~/.promptfoo/prompts/`.

Example YAML structure:

```yaml
id: customer-support
description: Customer support agent prompt
currentVersion: 3
versions:
  - version: 1
    author: alice@example.com
    createdAt: '2024-01-15T10:00:00Z'
    content: |
      You are a customer support agent.
      Help the user with their query: {{query}}
    notes: Initial version
  - version: 2
    author: bob@example.com
    createdAt: '2024-01-16T14:30:00Z'
    content: |
      You are a friendly customer support agent for {{company}}.
      Help the user with their query: {{query}}
      Be polite and professional.
    notes: Added company variable and tone guidance
deployments:
  production: 2
  staging: 3
```

## Cloud Mode

When using Promptfoo Cloud, prompts are stored in the database and synced across your team.

Enable cloud mode:

```bash
promptfoo auth login
# Prompts will now sync to cloud automatically
```

## Integration with Evaluations

### Using Managed Prompts in Configs

Reference managed prompts in your evaluation configs:

```yaml
# promptfooconfig.yaml
prompts:
  - pf://customer-support       # Uses current version
  - pf://customer-support:2     # Uses specific version
  - pf://customer-support:prod  # Uses production deployment

providers:
  - openai:gpt-4
  
tests:
  - vars:
      query: "How do I reset my password?"
      company: "Acme Corp"
```

### Testing Prompts

The prompt management system includes a powerful testing interface that properly handles variables in your prompts.

#### CLI Testing

Run evaluations directly on prompts:

```bash
# Test with test cases file
promptfoo prompt test customer-support \
  --provider openai:gpt-4 \
  -t test-cases.yaml

# Test specific version
promptfoo prompt test customer-support \
  --version 2 \
  --provider anthropic:claude-3
```

#### Web UI Testing

The web interface provides an interactive testing experience:

1. **Variable Detection**: Automatically extracts all `{{variables}}` from your prompt template
2. **Individual Inputs**: Provides separate input fields for each variable
3. **Preview Mode**: Shows the rendered prompt with all variables replaced before testing
4. **Rich Results**: Displays the provider response along with metadata like token usage and cost

To test a prompt in the UI:
1. Navigate to a prompt and click "Test"
2. Select the version and provider from a comprehensive list
3. Fill in values for each variable
4. Click "Preview Prompt" to see the final rendered prompt
5. Click "Run Test" to execute

The test feature properly handles:
- Multiple variables with individual inputs
- Complex templates with conditional logic
- Different provider configurations
- Token usage and cost tracking

The provider selection includes models from:
- OpenAI (GPT-4.1, GPT-4o, o3/o4 with thinking capabilities)
- Anthropic (Claude 4, Claude 3.7, Claude 3.5 families)
- AWS Bedrock (Claude, Llama, Amazon Nova models)
- Azure OpenAI deployments
- Google Vertex AI (Gemini, Claude, Llama models)
- OpenRouter (various models)
- And many more providers with their latest models

## Best Practices

### Versioning

1. **Semantic Notes**: Add clear notes explaining what changed in each version
2. **Test Before Deploy**: Always test new versions before deploying to production
3. **Gradual Rollout**: Deploy to staging first, then production

### Naming Conventions

Use descriptive, hierarchical names:

```
# Good
customer-support-agent
sales-email-composer
code-review-assistant

# Avoid
prompt1
test
my-prompt
```

### Variable Management

Document all variables used in your prompts:

```yaml
# In prompt content
You are a {{role}} assistant for {{company}}.

# Document in description
description: |
  Customer support prompt.
  Variables:
  - role: The type of support (technical, billing, general)
  - company: Company name
  - tone: Response tone (formal, friendly, casual)
```

### Team Collaboration

1. **Author Tracking**: All versions track the author automatically
2. **Change Notes**: Always add meaningful notes when creating versions
3. **Review Process**: Use diff to review changes before deployment

## Advanced Features

### Bulk Operations

Export/import prompts for backup or migration:

```bash
# Export all prompts
promptfoo prompt export > prompts-backup.json

# Import prompts
promptfoo prompt import < prompts-backup.json
```

### API Access

Access prompts programmatically:

```javascript
import { PromptManager } from 'promptfoo';

const manager = new PromptManager();

// Get prompt
const prompt = await manager.getPrompt('customer-support');

// Create version
const newVersion = await manager.updatePrompt(
  'customer-support',
  'Updated content...',
  'Added new features'
);

// Deploy
await manager.deployPrompt('customer-support', 'production', 3);
```

### Environment Variables

Configure prompt management behavior:

```bash
# Set custom prompts directory
export PROMPTFOO_PROMPTS_DIR=/path/to/prompts

# Enable cloud sync
export PROMPTFOO_CLOUD_SYNC=true

# Set default environment
export PROMPTFOO_DEFAULT_ENV=staging
```

## Troubleshooting

### Common Issues

**Prompt not found**: Ensure the prompt ID exists:
```bash
promptfoo prompt list
```

**Version conflicts**: If working in teams, pull latest changes:
```bash
promptfoo prompt sync
```

**Deployment fails**: Check version exists and environment is valid:
```bash
promptfoo prompt show my-prompt
```

### Migration from Legacy Prompts

Convert existing prompt files to managed prompts:

```bash
# Import single file
promptfoo prompt create my-prompt --from-file old-prompt.txt

# Bulk import
for file in prompts/*.txt; do
  name=$(basename "$file" .txt)
  promptfoo prompt create "$name" --from-file "$file"
done
```

## Security Considerations

1. **Access Control**: In cloud mode, prompts follow your organization's access controls
2. **Sensitive Data**: Avoid hardcoding sensitive information in prompts
3. **Audit Trail**: All changes are logged with author and timestamp
4. **Encryption**: Cloud-stored prompts are encrypted at rest

## Caveats and Considerations

### File References

When using managed prompts, there are important considerations regarding file references:

1. **File References in Prompts**: If your prompt contains `file://` references to external files (e.g., `file://templates/base.txt`), these references are **preserved as-is** in the managed prompt. They are not serialized or embedded into the prompt content.

2. **Path Resolution**: File references are resolved relative to where the evaluation is run, not where the prompt was created. This means:
   - If you create a prompt with `file://data/context.txt` in one directory
   - And run an evaluation using that prompt from a different directory
   - The file path will be resolved from the evaluation directory

3. **Best Practices**:
   - Use absolute paths when possible for consistency
   - Or ensure relative paths are consistent across your project structure
   - Consider embedding the content directly in the prompt if it's not too large
   - Document any required files in the prompt description

4. **Example**:
   ```yaml
   # This prompt contains a file reference
   prompts:
     - |
       {{#include file://templates/system.txt}}
       
       User: {{query}}
   ```
   
   When this prompt is stored as a managed prompt, the `file://templates/system.txt` reference is preserved. Anyone using this prompt needs to have that file available at the expected path.

### Version Control Integration

While managed prompts provide built-in versioning, they are not currently backed by git or other VCS. Each version is stored independently in the database or YAML files. Consider:

- Exporting important prompts to your git repository for additional backup
- Using the CLI export functionality for disaster recovery
- Implementing your own backup strategy for production prompts

### Size Limitations

- **Local Mode**: Limited only by filesystem constraints
- **Cloud Mode**: Prompts larger than 1MB may require special handling
- Consider splitting very large prompts into smaller, composable pieces

## Next Steps

- Learn about [prompt testing strategies](../guides/prompt-testing)
- Explore [CI/CD integration](../integrations/ci-cd)
- Set up [team workflows](../guides/team-collaboration) 