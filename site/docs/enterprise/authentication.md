---
sidebar_label: Authentication
sidebar_position: 10
title: Authenticating into Promptfoo Enterprise
description: Configure enterprise authentication with SSO providers, API keys, service accounts, and CLI access for secure team collaboration
keywords: [authentication, login, logout, promptfoo enterprise, promptfoo app, sso, saml, oidc]
---

# Authentication

## Setting Up SSO

[Promptfoo Enterprise](/docs/enterprise/) supports SSO through SAML 2.0 and OIDC. Contact support with your IdP information to configure SSO. For on-prem deployments, start at your organization's Promptfoo URL; it redirects to the identity provider configured for that deployment.

On-prem organization admins can choose how assignments are managed under **Organization Settings → SSO Settings**:

| Mode                                            | Behavior                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Manage Teams and Roles Manually                 | Manage team membership and roles in Promptfoo.                                                                      |
| Use Identity Provider for Team Assignment Only  | The IdP controls membership; new members receive the selected default role, and roles remain editable in Promptfoo. |
| Use Identity Provider for Roles and Permissions | The IdP controls both membership and roles; manual assignment is disabled.                                          |

For IdP-managed modes, verify the team and role mappings before enabling them. On the next login, memberships synchronize with the IdP, including removal from teams no longer assigned there.

## Basic Authentication

Hosted deployments using `auth.promptfoo.app` support password login. When an organization is created, the global admin will receive an email from Promptfoo Enterprise to log in. Users, teams, and roles are managed in Organization Settings, as detailed in the [Teams documentation](./teams.md).

Where magic-link login is enabled, click "Login with a magic link" on the login page. You will receive an email with a link to log in; check your spam folder if it does not arrive. On-prem users should use their deployment's login page and the sign-in methods enabled by their administrator.

## Authenticating Into the CLI

You may wish to authenticate into the CLI when using Promptfoo Enterprise. Follow these steps to connect Promptfoo Enterprise to the CLI.

1. Install the Promptfoo CLI. Read [getting started](/docs/getting-started/) for help installing the CLI.

2. In the Promptfoo Enterprise app, open your profile menu and select **CLI Login**.

3. Select **Generate CLI Token**, then copy and run the `promptfoo auth login` command in your terminal.

4. Once authenticated, you can run `promptfoo eval --share` or `promptfoo share` to share eval results to your Promptfoo Enterprise organization.

For on-prem API-key login, use your deployment's API base URL without `/api/v1`. If the app and API use different URLs, pass the API URL to `--host`. Supply a **Promptfoo** API key from that instance, not an OpenAI key:

```sh
promptfoo auth login --host https://promptfoo.example.com --api-key "$PROMPTFOO_API_KEY"
promptfoo auth whoami
```

Set `PROMPTFOO_API_KEY` through your secret manager before running this command. For CI without a saved login, set `PROMPTFOO_API_KEY`, `PROMPTFOO_CLOUD_API_URL` to the API base URL, and `PROMPTFOO_REMOTE_APP_BASE_URL` to the browser-facing app URL so report links open in your deployment. A saved API key and host take precedence over their environment variables. See [Enterprise sharing](/docs/usage/sharing#enterprise-sharing) for gateways that use a separate authentication header.

:::tip
CLI runs can upload results automatically after Enterprise login. Use `promptfoo share` to upload existing local evals, or see [disabling sharing](/docs/usage/sharing#disabling-sharing) to keep a CLI run local. Scans run on the server store their results in your deployment.
:::

Authenticating with your organization's account enables [team-based sharing](/docs/usage/sharing#enterprise-sharing), ensuring your evaluation results are only visible to members of your organization rather than being publicly accessible.

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

The selected team is used when sharing results that are not associated with a saved cloud scan configuration. Saved scan configurations are retrieved by ID, and their results retain the configuration's team.
