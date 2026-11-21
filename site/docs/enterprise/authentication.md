---
sidebar_label: Authentication
sidebar_position: 10
title: Authenticating into Promptfoo Enterprise
description: Configure enterprise authentication with SSO providers, API keys, service accounts, and CLI access for secure team collaboration
keywords: [authentication, login, logout, promptfoo enterprise, promptfoo app, sso, saml, oidc]
---

# Authentication

## Setting Up SSO

[Promptfoo Enterprise](/docs/enterprise/) supports SAML 2.0 and OIDC. For hosted deployments, contact support with your identity provider information.

For on-prem deployments, sign in at your organization's Promptfoo URL. Organization administrators can [configure SSO and team assignments](./sso.md). Test those assignments before enabling synchronization. At login, synchronization can remove team memberships.

## Basic Authentication

Hosted deployments using `auth.promptfoo.app` support password login. The organization's first administrator receives a login email and can manage users, [teams and roles](./teams.md) in Organization Settings.

If enabled, **Login with a magic link** sends you a sign-in link by email. On-prem users can choose from the sign-in methods enabled on their deployment's login page.

## Authenticating Into the CLI

You may wish to authenticate into the CLI when using Promptfoo Enterprise. Follow these steps to connect Promptfoo Enterprise to the CLI.

1. Install the Promptfoo CLI. Read [getting started](/docs/getting-started/) for help installing the CLI.

2. In the Promptfoo Enterprise app, open your profile menu and select **CLI Login Information**.

3. Select **Generate CLI Token**, then copy and run the `promptfoo auth login` command in your terminal.

4. Once authenticated, you can run `promptfoo eval --share` or `promptfoo share` to share eval results to your Promptfoo Enterprise organization.

For API key login on-prem, set `PROMPTFOO_API_KEY` to a Promptfoo key from your deployment. Pass its API base URL without `/api/v1` to `--host`. Use a trusted terminal because the key appears in the process arguments.

```sh
promptfoo auth login --host https://promptfoo.example.com --api-key "$PROMPTFOO_API_KEY"
promptfoo auth whoami
```

For CI without a saved login, configure `PROMPTFOO_API_KEY` in your secret manager, `PROMPTFOO_CLOUD_API_URL` for the API base URL, and `PROMPTFOO_REMOTE_APP_BASE_URL` for the browser-facing app URL. A saved key and API host take precedence over these environment variables. See [Enterprise sharing](/docs/usage/sharing#enterprise-sharing) if your gateway uses a separate authentication header.

:::tip
CLI runs can upload results automatically after Enterprise login. Use `promptfoo share` to upload existing local evals, or see [disabling sharing](/docs/usage/sharing#disabling-sharing) to keep a CLI run local. Scans run on the server store their results in your deployment.
:::

## Working with Multiple Teams

If your organization has multiple teams, you can manage which team context you're operating in:

### Viewing Your Teams

```sh
# List all teams you have access to
promptfoo auth teams list
```

This shows the teams accessible to your API key in its organization, with a marker (●) next to your current team.

### Switching Teams

```sh
# Switch to a different team
promptfoo auth teams set "Data Science"
```

You can use the team name, slug, or ID. Your selection persists across CLI sessions.

To switch organizations, run `promptfoo auth login --api-key <apiKey>` with a key from the organization you want to use.

### Checking Current Team

```sh
# View your active team
promptfoo auth teams current
```

The CLI shares results with the selected team by default. When you run a saved scan configuration by ID, the team assigned to the run takes precedence. If you use an organization-wide template with another team's target, look for the report under the **target's team**.
