---
sidebar_label: Link to Cloud Targets
description: Link local custom providers to cloud targets in Promptfoo Cloud using linkedTargetId to consolidate findings and track performance over time
---

# Linking Local Targets to Cloud

When using custom providers (Python, JavaScript, HTTP), link your local configuration to a cloud target using `linkedTargetId`. This consolidates findings from multiple eval runs into one dashboard, allowing you to track performance and vulnerabilities over time and view comprehensive reporting.

## How to Link Targets

### Step 1: Get the Target ID

1. Log in to Promptfoo Cloud (https://www.promptfoo.app/ or your on-prem URL)
2. Navigate to the Targets page: `/redteam/targets`
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

Results will now consolidate under the linked cloud target.

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
   - Visit your cloud dashboard `/redteam/targets` page
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

Yes, linkedTargetId works with any provider type. However, it's most useful for custom providers (Python, JavaScript, HTTP) since they don't have a stable identifier. Built-in providers (like `openai:gpt-4`) already have consistent IDs, so they're less likely to need manual linking.

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
