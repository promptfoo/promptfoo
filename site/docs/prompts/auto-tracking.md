# Auto-Tracking Guide

Auto-tracking automatically discovers and manages prompts used in your Promptfoo evaluations. This feature helps you transition from scattered prompt files to a centralized management system without disrupting your workflow.

![Auto-Tracking Overview](../assets/prompt-auto-tracking-overview.png)

## What is Auto-Tracking?

Auto-tracking monitors your evaluation runs and automatically:

1. **Detects** unmanaged prompts in your configurations
2. **Creates** managed versions with unique IDs
3. **Preserves** all prompt features (config, variables, format)
4. **Enables** future reference via `pf://` protocol

## Why Use Auto-Tracking?

### Before Auto-Tracking

```yaml
# Prompts scattered across files and configs
prompts:
  - 'You are a helpful assistant'
  - file://prompts/customer-support.txt
  - label: api-handler
    raw: 'Handle this API request: {{request}}'
```

### After Auto-Tracking

```yaml
# Clean, versioned references
prompts:
  - pf://prompt-a5f3c2d1
  - pf://customer-support
  - pf://api-handler
```

![Before and After Auto-Tracking](../assets/prompt-auto-tracking-before-after.png)

## Enable Auto-Tracking

### Method 1: Environment Variable

```bash
export PROMPTFOO_AUTO_TRACK_PROMPTS=true
promptfoo eval
```

### Method 2: Configuration File

```yaml
# .promptfoorc
promptAutoTracking:
  enabled: true
```

### Method 3: Command Line Flag

```bash
promptfoo eval --auto-track-prompts
```

## How It Works

![Auto-Tracking Flow Diagram](../assets/prompt-auto-tracking-flow-detailed.png)

### 1. Detection Phase

During evaluation, auto-tracking scans for:

- Inline prompt strings
- File-based prompts
- Function prompts
- Prompts with labels
- Prompts with configurations

### 2. ID Generation

IDs are generated based on:

```
Has label? → Use sanitized label
No label? → Use content hash (prompt-{8-char-hash})
```

Examples:

- Label: `"Customer Support"` → ID: `customer-support`
- No label: `"You are..."` → ID: `prompt-a5f3c2d1`

### 3. Storage Phase

Each tracked prompt is stored with:

- Original content
- Configuration
- Content type
- Source information
- Timestamp and author

### 4. Reference Update

Future runs can use the managed reference:

```yaml
# Original
prompts:
  - "You are a helpful assistant for {{company}}"

# After tracking (automatic reference)
prompts:
  - pf://prompt-a5f3c2d1
```

## Configuration Options

### Basic Configuration

```yaml
promptAutoTracking:
  enabled: true
  excludePatterns:
    - '*.test.*' # Exclude test files
    - 'examples/*' # Exclude examples
    - 'pf://*' # Don't track already managed
```

### Advanced Configuration

```yaml
promptAutoTracking:
  enabled: true

  # ID generation
  idStrategy:
    type: 'label-first' # Prefer labels for IDs
    hashLength: 8 # Hash length for auto IDs
    prefix: 'auto-' # Prefix for auto-generated IDs

  # Filtering
  includePatterns:
    - 'src/prompts/**' # Only track from specific dirs
    - 'config/*.yaml'

  excludePatterns:
    - '**/*.test.*'
    - '**/node_modules/**'
    - '**/.git/**'

  # Behavior
  behavior:
    updateExisting: false # Don't update existing prompts
    createVersions: true # Create new versions for changes
    preserveLabels: true # Keep original labels
    trackFunctions: true # Track function prompts
    trackConfigs: true # Track prompt configurations

  # Notifications
  notifications:
    onTrack: true # Show when prompts are tracked
    summary: true # Show summary after evaluation
    verbose: false # Detailed tracking logs
```

## Tracking Examples

### Example 1: Simple String Prompt

**Before:**

```yaml
prompts:
  - 'You are a helpful AI assistant'
```

**Tracked as:**

```yaml
id: prompt-a5f3c2d1
content: 'You are a helpful AI assistant'
contentType: string
createdAt: 2024-01-20T10:00:00Z
```

**Future reference:**

```yaml
prompts:
  - pf://prompt-a5f3c2d1
```

### Example 2: Labeled Prompt with Config

**Before:**

```yaml
prompts:
  - label: customer-analyzer
    raw: 'Analyze customer sentiment: {{message}}'
    config:
      temperature: 0.3
      max_tokens: 200
```

**Tracked as:**

```yaml
id: customer-analyzer
content: 'Analyze customer sentiment: {{message}}'
contentType: string
config:
  temperature: 0.3
  max_tokens: 200
label: customer-analyzer
```

**Future reference:**

```yaml
prompts:
  - pf://customer-analyzer
```

### Example 3: Function Prompt

**Before:**

```yaml
prompts:
  - file://generate-prompt.js
```

Where `generate-prompt.js`:

```javascript
module.exports = ({ vars }) => {
  return `Process ${vars.type} request: ${vars.content}`;
};
```

**Tracked as:**

```yaml
id: generate-prompt
content: 'module.exports = ({ vars }) => { ... }'
contentType: function
fileFormat: .js
functionSource: 'module.exports = ({ vars }) => { ... }'
```

## Exclude Patterns

### Pattern Syntax

Use glob patterns to exclude files:

```yaml
excludePatterns:
  # Exact matches
  - 'test-prompt.yaml'

  # Wildcards
  - '*.test.*'
  - 'temp-*'

  # Directories
  - 'tests/*'
  - 'examples/**/*'

  # Specific patterns
  - 'pf://*' # Already managed
  - '**/__tests__/**' # Test directories
```

### Common Exclusions

```yaml
excludePatterns:
  # Development
  - '*.test.*'
  - '*.spec.*'
  - 'examples/*'
  - 'sandbox/*'

  # Dependencies
  - 'node_modules/**'
  - 'vendor/**'
  - '.venv/**'

  # Version control
  - '.git/**'
  - '.svn/**'

  # Build artifacts
  - 'dist/**'
  - 'build/**'
  - '*.min.js'

  # Temporary
  - 'tmp/*'
  - '*.tmp'
  - '*.bak'
```

## Workflow Integration

### CI/CD Pipeline

```yaml
# .github/workflows/prompt-tracking.yml
name: Track Prompts
on: [push, pull_request]

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Track prompts
        env:
          PROMPTFOO_AUTO_TRACK_PROMPTS: true
          PROMPTFOO_API_KEY: ${{ secrets.PROMPTFOO_API_KEY }}
        run: |
          npx promptfoo@latest eval --no-watch

      - name: Export tracked prompts
        run: |
          npx promptfoo@latest prompt export > prompts-manifest.json

      - name: Upload manifest
        uses: actions/upload-artifact@v3
        with:
          name: prompt-manifest
          path: prompts-manifest.json
```

### Git Hooks

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Track prompts before commit
export PROMPTFOO_AUTO_TRACK_PROMPTS=true
npx promptfoo eval --no-cache --no-watch

# Add tracked prompts to commit
git add ./prompts/*.yaml
```

### Development Workflow

![Development Workflow](../assets/prompt-auto-tracking-dev-workflow.png)

1. **Development**: Write prompts inline or in files
2. **Testing**: Run evaluations with auto-tracking
3. **Review**: Check tracked prompts
4. **Refactor**: Update configs to use `pf://` references
5. **Deploy**: Managed prompts are versioned and deployed

## Best Practices

### 1. Use Descriptive Labels

```yaml
# Good - will create meaningful IDs
prompts:
  - label: customer-support-greeting
    raw: "Welcome to our support..."

  - label: error-handler-api
    raw: "An error occurred..."

# Less ideal - will use hash IDs
prompts:
  - "Welcome to our support..."
  - "An error occurred..."
```

### 2. Review Before Production

```bash
# Review what was tracked
promptfoo prompt list --filter auto-tracked

# Test with managed references
promptfoo eval --prompts pf://auto-tracked-id
```

### 3. Gradual Migration

```yaml
# Phase 1: Mix managed and unmanaged
prompts:
  - pf://migrated-prompt
  - "Still being tracked"
  - file://old-prompt.txt

# Phase 2: Mostly managed
prompts:
  - pf://migrated-prompt
  - pf://newly-tracked
  - "Last few to migrate"

# Phase 3: Fully managed
prompts:
  - pf://prompt-1
  - pf://prompt-2
  - pf://prompt-3
```

### 4. Clean Up After Tracking

```bash
# Find unused prompt files
promptfoo prompt find-unused

# Archive old files
mkdir archived-prompts
mv old-*.txt archived-prompts/
```

## Monitoring Auto-Tracking

### Track Summary

After evaluation with auto-tracking:

```
Auto-Tracking Summary:
- Tracked: 5 new prompts
- Updated: 2 existing prompts
- Skipped: 3 prompts (excluded)

New prompts:
- customer-support (from label)
- prompt-a5f3c2d1 (from content)
- api-handler (from label)
```

### Tracking Logs

Enable verbose logging:

```bash
export PROMPTFOO_AUTO_TRACK_VERBOSE=true
promptfoo eval
```

Output:

```
[Auto-Track] Scanning prompts...
[Auto-Track] Found: "You are a helpful..." (no label)
[Auto-Track] Generated ID: prompt-a5f3c2d1
[Auto-Track] Saving prompt...
[Auto-Track] ✓ Tracked successfully
```

### Tracking Metrics

View tracking statistics:

```bash
promptfoo prompt stats --auto-tracked
```

```
Auto-Tracking Statistics:
- Total tracked: 127 prompts
- This week: 23 prompts
- Most common source: inline (67%)
- Average tracking time: 12ms
```

## Troubleshooting

### Prompts Not Being Tracked

1. **Check if enabled**:

   ```bash
   echo $PROMPTFOO_AUTO_TRACK_PROMPTS
   ```

2. **Check exclude patterns**:

   ```yaml
   # May be too broad
   excludePatterns:
     - '*' # This excludes everything!
   ```

3. **Check permissions** (local mode):
   ```bash
   ls -la ./prompts/
   # Should be writable
   ```

### Duplicate Tracking

If same prompt tracked multiple times:

```bash
# Find duplicates
promptfoo prompt find-duplicates

# Merge duplicates
promptfoo prompt merge <id1> <id2>
```

### Performance Issues

For large projects:

```yaml
promptAutoTracking:
  performance:
    batchSize: 50 # Track in batches
    maxConcurrent: 5 # Parallel tracking
    debounceMs: 100 # Debounce rapid changes
```

## Security Considerations

### Sensitive Content

```yaml
promptAutoTracking:
  security:
    # Don't track prompts with sensitive patterns
    sensitivePatterns:
      - '*api[_-]key*'
      - '*secret*'
      - '*password*'
      - '*token*'

    # Redact sensitive variables
    redactVariables:
      - apiKey
      - authToken
      - password
```

### Access Control

```yaml
promptAutoTracking:
  permissions:
    # Who can view auto-tracked prompts
    defaultVisibility: 'team' # or "private", "public"

    # Require approval for auto-tracked prompts
    requireApproval: true
```

## Next Steps

- [Configuration Reference](configuration#auto-tracking-configuration) - Detailed configuration
- [Best Practices](best-practices#auto-tracking) - Production patterns
- [API Reference](api-reference#auto-tracking-api) - Programmatic control
- [Examples](examples/auto-tracking) - Real-world scenarios
