---
sidebar_label: Managing Roles and Teams
sidebar_position: 20
title: Managing Roles and Teams in Promptfoo Enterprise
description: Implement team collaboration with role-based access control, project permissions, and audit logging in Promptfoo Enterprise
keywords: [roles, teams, permissions, users, organizations, rbac, access control]
---

# Managing Roles and Teams

[Promptfoo Enterprise](/docs/enterprise/) supports a flexible role-based access control (RBAC) system that allows you to manage user access to your organization's resources.

## Creating Teams

Promptfoo Enterprise supports multiple teams within an organization. To create a team, navigate to the "Teams" tab in the sidebar and click the "New Team" button.

![New Team](/img/enterprise-docs/create-team.png)

You can add users to a team by editing the team and clicking the "Add team members" button. This will also allow you to set the role of the user in the team.

![Add Team Members](/img/enterprise-docs/add-team-members.png)

You can also create service accounts at the team level, which will allow you to create API keys for programmatic access to Promptfoo Enterprise. These are useful for CI/CD pipelines and automated testing.

:::note
Only system admins can create service accounts.
:::

## Team Secrets (On-Prem)

Team secrets store encrypted provider credentials that can be reused within a team. Open the team's settings, select **Secrets**, and click **Create Secret**. Enter a name, value, and optional description. Names must be unique within the team.

In a provider's API Key field, use the key button to choose a team secret. This saves a reference such as `%__PF_SECRET.OPENAI_API_KEY__%` instead of copying the credential into the provider configuration. Team Red Team Provider overrides can also use these references.

Secret permissions are separate from provider permissions: read access allows listing secrets and selecting references; update access is required to reveal or copy values. Creating and deleting secrets require their respective permissions. Being able to configure a target does not by itself grant access to reveal its secret values.

To rotate a value without changing its references, use the [API](/docs/api-reference/): find the secret ID with `GET /api/v1/teams/{teamId}/secrets`, then send `PATCH /api/v1/teams/{teamId}/secrets/{secretId}` with the replacement value:

```json
{ "value": "<replacement-provider-api-key>" }
```

Start a new scan to verify the replacement before revoking the old key with your model provider. The current Secrets table supports creation, reveal/copy, and deletion; use the API for updating a value.

Before deleting a secret, check its **References** column and the team's Red Team Provider configuration. Remove or replace references first. Promptfoo blocks deletion while saved targets still reference the secret; the References column does not include the team Red Team Provider override.

## Team Probe Limits (On-Prem)

When the organization has a licensed probe limit, an organization admin can set **Probe limit** in the team's settings and click **Save Changes**. Leave it blank for no additional team cap; the organization limit still applies. The sum of configured team caps cannot exceed the organization's licensed limit.

Probe caps control scan volume, not model-provider token spend. Use your model provider's billing controls for spending budgets and alerts.

## CLI Team Context

When using the Promptfoo CLI with multiple teams, you can control which team context your operations use:

### Setting Your Active Team

After logging in, set your active team using:

```sh
promptfoo auth teams set "Your Team Name"
```

All subsequent CLI operations (evaluations, sharing results, etc.) will use this team context.

### Verifying Team Context

Before running important operations, verify your active team:

```sh
promptfoo auth whoami
```

This displays your current organization and team.

### Team Isolation

- **Organization selection**: API keys are scoped to one organization. To switch organizations, run `promptfoo auth login --api-key <apiKey>` with a key from that organization
- **Team selections are isolated per organization**: If you have access to multiple organizations, each organization remembers its own team selection independently
- **Resources are team-scoped**: Evaluations, configurations, and results are associated with your active team

:::tip
Always verify your team context with `promptfoo auth whoami` before sharing evaluation results or running scans to ensure they go to the correct team.
:::

## Creating Roles

Promptfoo allows you to create custom roles to manage user access to your organization's resources. To create a role, navigate to the "Roles" tab in the sidebar and click the "New Role" button.

![New Role](/img/enterprise-docs/create-new-role.png)

### Permissions

Promptfoo Enterprise supports the following permissions:

- **Administrator**: Full access to everything in the team
- **View Configurations**: View configurations, targets, and plugin collections
- **Run Scans**: Run scans and view results
- **Manage Configurations**: Create, edit, and delete configurations and plugin collections
- **Manage Targets**: Create, edit, and delete targets
- **View Results**: View issues and evaluations
- **Manage Results**: Edit and delete evaluations and issues

## See Also

- [Authentication](./authentication.md)
- [Service Accounts](./service-accounts.md)
