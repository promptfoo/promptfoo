---
sidebar_label: Authentication
sidebar_position: 10
title: Authenticating into Promptfoo Enterprise
description: Configure enterprise authentication with SSO providers, API keys, service accounts, and CLI access for secure team collaboration
keywords: [authentication, login, logout, promptfoo enterprise, promptfoo app, sso, saml, oidc]
---

# Authentication

## Setting Up SSO

Promptfoo supports both basic authentication and SSO through SAML 2.0 and OIDC. To configure SSO with Promptfoo Enterprise, reach out to the support team with your IdP information and the Promptfoo team will configure it. The authentication endpoint is `auth.promptfoo.app`.

## Basic Authentication

Promptfoo supports basic authentication into the application through `auth.promptfoo.app`. When an organization is created, the global admin will receive an email from Promptfoo to log in. Users, teams, and roles will be created in the Organization Settings of the Promptfoo application, which is detailed further in the [Teams documentation](./teams.md).

You can also authenticate into the application using a magic link. To do this, navigate to `auth.promptfoo.app` and click the "Login with a magic link" button. You will receive an email with a link to log in. If you do not receive an email, please be sure to check your spam folder.

## Authenticating the CLI

Connect the Promptfoo CLI to your Enterprise account to share evaluations and run red team scans.

### Browser-Based Login (Recommended)

The simplest way to authenticate is through your browser:

```sh
promptfoo auth login
```

This opens your browser to a device authorization page. Verify the code displayed in your terminal matches the one shown in the browser, then sign in with your Enterprise credentials. The CLI receives your authentication token automatically.

![Device authorization - sign in to authorize](/img/enterprise-docs/device-auth-code-verified.png)

Once authorized, you'll see a confirmation and can close the browser:

![Device authorized successfully](/img/enterprise-docs/device-auth-success.png)

For self-hosted instances, specify your host:

```sh
promptfoo auth login --host https://promptfoo.your-company.com
```

### API Key Login

For CI/CD pipelines or automated environments where browser authentication isn't available, use an API key:

```sh
promptfoo auth login --api-key YOUR_API_KEY
```

To obtain an API key:

1. Open the Promptfoo Enterprise app
2. Navigate to your profile settings
3. Select **CLI Login Information**
4. Copy the API key

For CI/CD, set the `PROMPTFOO_API_KEY` environment variable instead of passing it on the command line.

### Verify Authentication

Check your current authentication status:

```sh
promptfoo auth whoami
```

### Logout

```sh
promptfoo auth logout
```

:::tip
All evaluations are stored locally until you share them. Run `promptfoo share` to upload existing local evaluations to your Enterprise organization.
:::

Authenticating with your organization's account enables [team-based sharing](/docs/usage/sharing#enterprise-sharing), ensuring your evaluation results are only visible to members of your organization.

## Working with Multiple Teams

If your organization has multiple teams, you can manage which team context you're operating in:

### Viewing Your Teams

```sh
# List all teams you have access to
promptfoo auth teams list
```

This shows all available teams with a marker (●) next to your current team.

### Switching Teams

```sh
# Switch to a different team
promptfoo auth teams set "Data Science"
```

You can use the team name, slug, or ID. Your selection persists across CLI sessions.

### Checking Current Team

```sh
# View your active team
promptfoo auth teams current
```

All operations (evaluations, red team scans, etc.) will use this team context until you switch to a different team.
