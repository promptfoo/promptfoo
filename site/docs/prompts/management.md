---
sidebar_position: 50
---

# Prompt Management

:::tip Comprehensive Documentation Available

This page provides a technical overview. For in-depth guides, see:

- 🚀 **[Quickstart Guide](quickstart)** - Get up and running in 5 minutes
- 📚 **[Core Concepts](concepts)** - Understand the fundamentals
- ⚙️ **[Configuration Reference](configuration)** - All configuration options
- 🤖 **[Auto-Tracking Guide](auto-tracking)** - Automatic prompt discovery
- 🔧 **[API Reference](api-reference)** - Programmatic access
- ✨ **[Best Practices](best-practices)** - Production patterns

:::

<!-- ![Prompt Management Dashboard](../assets/prompt-management-dashboard.png) -->

Promptfoo provides a comprehensive prompt management system that enables version control, deployment tracking, and team collaboration for your AI prompts. This system allows you to treat prompts as first-class citizens in your development workflow.

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

#### Variable Detection

When creating or editing prompts, the system automatically detects variables in your template:

- **Automatic Detection**: Scans for `{{variable}}` patterns in your prompt
- **Visual Display**: Shows detected variables as chips below the editor
- **Validation**: Helps ensure all variables are properly documented
- **Usage Guidance**: Indicates which values will be needed during testing

This feature helps you:

- Quickly identify all variables in complex prompts
- Ensure consistent variable naming
- Document requirements for prompt users
- Prepare test cases with the right variables

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
  - pf://customer-support # Uses current version
  - pf://customer-support:2 # Uses specific version
  - pf://customer-support:prod # Uses production deployment

providers:
  - openai:gpt-4

tests:
  - vars:
      query: 'How do I reset my password?'
      company: 'Acme Corp'
```

### Re-running Evaluations with Different Prompt Versions

When viewing evaluation results that use managed prompts, you can easily re-run the same test cases with different prompt versions:

1. **Access the Version Selector**: In the evaluation results page, click "Eval actions" → "Re-run with different prompt version"
2. **Select Versions**: For each managed prompt in the evaluation:
   - View the current version being used
   - Select a new version from the dropdown (specific versions or environment deployments)
   - Click "View Diff" to see changes between versions
   - Access full version history with the "History" button
3. **Re-run**: Click "Re-run with Selected Versions" to update the configuration and navigate to the setup page

This feature is particularly useful for:

- **A/B Testing**: Compare how different prompt versions perform on the same test cases
- **Regression Testing**: Ensure new prompt versions don't break existing functionality
- **Performance Comparison**: Evaluate improvements between prompt iterations
- **Rollback Testing**: Quickly test previous versions if issues arise

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

The web interface provides an interactive testing experience with AI-powered assistance:

1. **Variable Detection**: Automatically extracts all `{{variables}}` from your prompt template
2. **Individual Inputs**: Provides separate input fields for each variable
3. **Smart Variable Suggestions**: AI-powered suggestions for test values based on prompt context
4. **Preview Mode**: Shows the rendered prompt with all variables replaced before testing
5. **Rich Results**: Displays the provider response along with metadata like token usage and cost

##### Smart Variable Suggestions

The testing interface includes an intelligent variable suggestion feature that helps you quickly generate realistic test values:

- **Context-Aware**: Analyzes your prompt content to suggest relevant values
- **Multiple Options**: Provides 3-5 suggestions per variable
- **One-Click Application**: Apply individual suggestions or all at once
- **Intelligent Fallbacks**: Works even without LLM access using pattern matching

For example, if your prompt contains:

```text
You are a {{role}} assistant helping with {{task}}.
The user's name is {{userName}} and they work at {{company}}.
```

The system might suggest:

- **role**: "customer support", "technical", "sales", "general"
- **task**: "troubleshooting", "product information", "billing inquiry"
- **userName**: "Alice Johnson", "Bob Smith", "Charlie Brown"
- **company**: "Acme Corp", "Tech Solutions Inc", "Global Enterprises"

To use smart suggestions:

1. Navigate to a prompt and click "Test"
2. Click "Generate" in the Smart Variable Suggestions section
3. Review the AI-generated suggestions for each variable
4. Click on any suggestion to select it
5. Apply individual suggestions or click "Apply All"

The test feature properly handles:

- Multiple variables with individual inputs
- Complex templates with conditional logic
- Different provider configurations
- Token usage and cost tracking
- Automatic variable detection and suggestions

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

### Full Configuration Support

Managed prompts now support all the features available in regular prompts:

#### Prompt Configuration

You can attach configuration to prompts to control model behavior:

```bash
# Create a prompt with configuration
promptfoo prompt create weather-assistant \
  --content "You are a weather assistant" \
  --config '{"temperature": 0.7, "max_tokens": 500}'
```

#### Function Prompts

Store JavaScript or Python functions as prompts:

```bash
# Create a function prompt from file
promptfoo prompt create dynamic-prompt \
  --from-file prompt-function.js \
  --function

# Or inline
promptfoo prompt create simple-function \
  --content "({vars}) => `Hello ${vars.name}`" \
  --function
```

#### Chat Format Prompts

Store chat-style prompts with roles:

```bash
# Create a chat prompt
promptfoo prompt create chat-assistant \
  --from-file chat-prompt.json
```

Where `chat-prompt.json` contains:

```json
[
  { "role": "system", "content": "You are a helpful assistant" },
  { "role": "user", "content": "{{query}}" }
]
```

#### Response Formats and Schemas

Configure structured output formats:

```yaml
# In your eval config
prompts:
  - id: pf://structured-output
    config:
      response_format:
        type: json_schema
        json_schema:
          name: analysis
          schema:
            type: object
            properties:
              sentiment: { type: string }
              score: { type: number }
```

### Auto-Tracking Unmanaged Prompts

Promptfoo can automatically track prompts that aren't managed yet. This helps you discover and organize prompts across your codebase.

#### Enable Auto-Tracking

Set the environment variable:

```bash
export PROMPTFOO_AUTO_TRACK_PROMPTS=true
```

Or in your config:

```yaml
promptAutoTracking:
  enabled: true
  excludePatterns:
    - '*.test.*'
    - '*test*'
  includeMetadata: true
```

When enabled, any prompt used in evaluations will be automatically:

1. Assigned a unique ID based on content hash or label
2. Stored in the prompt management system
3. Available for future reference via `pf://prompt-id`

#### How Auto-Tracking Works

1. **Detection**: When you run an evaluation, all prompts are analyzed
2. **ID Generation**: Each prompt gets a unique ID:
   - If it has a label: `sanitized-label`
   - Otherwise: `prompt-{hash}`
3. **Storage**: The prompt is stored with all its features:
   - Configuration
   - Content type (string, JSON, function)
   - Original format
   - Labels and metadata

#### Example Workflow

```bash
# Run an eval with unmanaged prompts
promptfoo eval

# Auto-tracking creates managed versions:
# - "customer-support" from label
# - "prompt-a5f3c2d1" from content hash

# Now you can reference them
prompts:
  - pf://customer-support
  - pf://prompt-a5f3c2d1
```

### Supported File Formats

When creating prompts from files, all standard formats are supported:

- **Text formats**: `.txt`, `.md`
- **Data formats**: `.json`, `.jsonl`, `.yaml`, `.yml`, `.csv`
- **Template formats**: `.j2` (Jinja2)
- **Function formats**: `.js`, `.mjs`, `.ts`, `.py`

Example:

```bash
# Each format is properly detected and stored
promptfoo prompt create my-prompt --from-file prompt.yaml
promptfoo prompt create my-function --from-file generate.js
promptfoo prompt create my-template --from-file template.j2
```

### Provider-Specific Features

Managed prompts support provider-specific configurations:

```yaml
prompts:
  - id: pf://my-prompt
    config:
      # OpenAI specific
      temperature: 0.7
      response_format: { type: 'json_object' }

      # Anthropic specific
      max_tokens: 1000
      system: 'You are Claude'

      # Custom transforms
      transform: |
        return `[INST] ${prompt} [/INST]`
```

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
  'Added new features',
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
