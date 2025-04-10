---
sidebar_position: 40
description: Share your promptfoo evals with your team through cloud, enterprise, or self-hosted instances.
keywords: [eval sharing, LLM testing, promptfoo sharing, collaboration, team sharing]
---

# Sharing

Share your eval results with others using the `share` command.

## Quick Start (Cloud)

Most users will share to promptfoo.app cloud:

```sh
# Login (one-time setup)
promptfoo auth login

# Run an eval and share it
promptfoo eval
promptfoo share
```

:::note
Cloud sharing creates private links only visible to you and your organization. If you don't have an account, visit https://promptfoo.app/welcome to create one.
:::

## Sharing Specific Evals

```sh
# List available evals
promptfoo list

# Share by ID
promptfoo share my-eval-id
```

## Enterprise Sharing

If you have a Promptfoo Enterprise account:

```sh
# Login to your enterprise instance
promptfoo auth login --host https://your-company.promptfoo.app

# Share your eval
promptfoo share
```

Enterprise sharing includes additional features:

- Team-based access controls
- Custom sharing policies
- SSO integration

## CI/CD Integration

### Using API Tokens (Cloud/Enterprise)

```sh
# Authenticate with API token
export PROMPTFOO_API_KEY=your_api_token

# Run and share
promptfoo eval --share
```

Get your API token from the "CLI Login Information" section in your account settings.

## Advanced: Self-Hosted Sharing

For users with self-hosted instances:

```sh
# Configure sharing to your server
export PROMPTFOO_REMOTE_API_BASE_URL=http://your-server:3000
export PROMPTFOO_REMOTE_APP_BASE_URL=http://your-server:3000

# Share your eval (no login required)
promptfoo share
```

You can also add these settings to your `promptfooconfig.yaml`:

```yaml title="promptfooconfig.yaml"
sharing:
  apiBaseUrl: http://your-server:3000
  appBaseUrl: http://your-server:3000
```

:::tip
Self-hosted sharing doesn't require `promptfoo auth login` when these environment variables or config settings are present.
:::

## Disabling Sharing

To disable sharing completely:

```yaml title="promptfooconfig.yaml"
sharing: false
```

## See Also

- [Self-hosting](/docs/usage/self-hosting.md)
- [Command Line Usage](/docs/usage/command-line.md)
