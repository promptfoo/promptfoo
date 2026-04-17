---
sidebar_label: Managing Roles and Teams
sidebar_position: 20
title: Managing Roles and Teams in Promptfoo Enterprise
description: Implement team collaboration with role-based access control, project permissions, and audit logging in Promptfoo Enterprise
keywords: [roles, teams, permissions, users, organizations, rbac, access control]
---

# Managing Roles and Teams

Promptfoo Enterprise supports a flexible role-based access control (RBAC) system that allows you to manage user access to your organization's resources.

## Creating Teams

Promptfoo Enterprise supports multiple teams within an organization. To create a team, navigate to the "Teams" tab in the sidebar and click the "New Team" button.

![New Team](/img/enterprise-docs/create-team.png)

You can add users to a team by editing the team and clicking the "Add team members" button. This will also allow you to set the role of the user in the team.

![Add Team Members](/img/enterprise-docs/add-team-members.png)

You can also create service accounts at the team level, which will allow you to create API keys for programmatic access to Promptfoo Enterprise. These are useful for CI/CD pipelines and automated testing.

:::note
Only system admins can create service accounts.
:::

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

- **API keys are organization-scoped**: Your API key determines which organization you're logged into
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
