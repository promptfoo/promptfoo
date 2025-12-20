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

## Authenticating Into the CLI

You may wish to authenticate into the CLI when using Promptfoo. Follow these steps to connect Promptfoo Enterprise to the CLI.

1. Install the Promptfoo CLI. Read [getting started](/docs/getting-started/) for help installing the CLI.

2. In the Promptfoo Enterprise app, select the "CLI Login Information" underneath your profile.

![CLI Login Information](/img/enterprise-docs/CLI-login-setting.png)

3. Copy the first command and run in your CLI. Your CLI will then be authenticated to Promptfoo Enterprise, allowing you to share eval results run locally.

![CLI Login Command](/img/enterprise-docs/CLI-login-key.png)

4. Once authenticated, you can run `promptfoo eval --share` or `promptfoo share` to share eval results to your Promptfoo Enterprise organization.

:::tip
All of your evals are stored locally until you share them. If you were previously an open-source user, you can share your local evals to your Promptfoo Enterprise organization by running `promptfoo share`.
:::

Authenticating with your organization's account enables [team-based sharing](/docs/usage/sharing#enterprise-sharing), ensuring your evaluation results are only visible to members of your organization rather than being publicly accessible.

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
