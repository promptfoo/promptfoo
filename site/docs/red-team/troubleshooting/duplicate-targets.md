---
sidebar_label: Duplicate Targets
description: Prevent duplicate target creation in Promptfoo Cloud by linking custom providers to existing targets using linkedTargetId
---

# Preventing Duplicate Targets

When running red team scans with custom providers (Python, JavaScript, HTTP), each eval creates a new target entry in Promptfoo Cloud. Use `linkedTargetId` to link all results to a single target.

## When to Use linkedTargetId

Use `linkedTargetId` if:

- Running multiple red team scans against the same custom provider
- Want to track vulnerability trends over time for one target
- Need a clean, organized targets list in cloud dashboard

Without `linkedTargetId`, you'll see duplicate targets like:

- `my-api` (Run 1)
- `my-api` (Run 2)
- `my-api` (Run 3)

With `linkedTargetId`, all results appear under one target: `my-api`

## How to Link Targets

### Step 1: Get the Target ID

1. Log in to [Promptfoo Cloud](https://www.promptfoo.dev/)
2. Navigate to your [Targets page](https://www.promptfoo.dev/redteam/targets)
3. Find the target you want to link to
4. Copy its ID (looks like `12345678-1234-1234-1234-123456789abc`)

### Step 2: Add to Provider Config

Format the ID as `promptfoo://provider/<target-id>` and add to your provider config:

**Python provider:**

```yaml
providers:
  - id: 'file://my_provider.py'
    config:
      linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
      # Your other config...
```

**JavaScript provider:**

```yaml
providers:
  - id: 'file://customProvider.js'
    config:
      linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
      # Your other config...
```

**HTTP provider:**

```yaml
providers:
  - id: https
    config:
      url: 'https://api.example.com/endpoint'
      method: 'POST'
      linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
      headers:
        'Content-Type': 'application/json'
      body:
        prompt: '{{prompt}}'
```

### Step 3: Run Your Eval

Results will now appear under the linked target instead of creating a new one.

## Troubleshooting

### "Invalid linkedTargetId format" Error

**Problem:** linkedTargetId doesn't start with `promptfoo://provider/`

**Solution:** Ensure format is exactly `promptfoo://provider/<UUID>`:

```yaml
# ✅ Correct
linkedTargetId: 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'

# ❌ Wrong - missing prefix
linkedTargetId: '12345678-1234-1234-1234-123456789abc'

# ❌ Wrong - incorrect prefix
linkedTargetId: 'promptfoo://12345678-1234-1234-1234-123456789abc'
```

### "linkedTargetId not found" Error

**Problem:** Target doesn't exist in your cloud organization or you lack access

**Troubleshooting steps:**

1. **Verify you're logged in:**

   ```bash
   promptfoo auth status
   ```

2. **Check the target exists:**
   - Visit https://www.promptfoo.dev/redteam/targets
   - Verify the target ID is correct
   - Ensure target wasn't deleted

3. **Verify organization access:**
   - Targets are scoped to your organization
   - Ensure you're logged into the correct org
   - Confirm you have permission to access this target

### linkedTargetId Specified But Cloud Not Configured

**Warning message:** `linkedTargetId specified but cloud is not configured`

**Problem:** You're not logged into Promptfoo Cloud

**Solution:**

```bash
promptfoo auth login
```

linkedTargetId only works when cloud features are enabled.

## FAQ

**Q: Can I use linkedTargetId with built-in providers (OpenAI, Anthropic, etc.)?**

Yes, linkedTargetId works with any provider type. However, it's most useful for custom providers (Python, JavaScript, HTTP) since they don't have a stable identifier. Built-in providers (like `openai:gpt-4`) already have consistent IDs, so they're less likely to create duplicates.

**Q: What happens if I remove linkedTargetId after using it?**

The next eval will create a new target entry. Previous results remain under the linked target.

**Q: Can I link to a target from a different organization?**

No, targets are organization-scoped. You can only link to targets in your current organization.

**Q: Do I need a new linkedTargetId for each eval?**

No! Use the same linkedTargetId across all evals. That's the point - it consolidates results under one target.

## Related Documentation

- [Python Providers](/docs/providers/python/)
- [JavaScript Providers](/docs/providers/custom-api/)
- [HTTP Providers](/docs/providers/http/)
- [Red Team Configuration](/docs/red-team/configuration/)
