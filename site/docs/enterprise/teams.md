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

## Track OpenAI spend by team on-prem

On-prem teams can use separate OpenAI API projects to track test generation and grading spend and set project-level alerts. Configure each team's Red Team Provider with a key from its OpenAI project. The OpenAI key pays for model requests; it is separate from the Promptfoo API key used to log in or upload results.

:::note
These instructions apply to Promptfoo Enterprise On-Prem versions with team-level Red Team Provider overrides. They do not describe managed Promptfoo Cloud billing. If the controls below are missing, check your permissions and installed version with your administrator or Promptfoo support.
:::

### Configure team credentials

1. Create an OpenAI API project for each internal team and an API key scoped to that project. A [project-owned service account](https://developers.openai.com/api/docs/guides/terraform/service-accounts) can provide credentials for automated runs.
2. As a Promptfoo administrator, open **Organization → Global Providers → Red Team Provider** and enable the team under **Team-level overrides**. You can also enable **Let this team configure its own Red Team Provider** in the team's settings.
3. Select the team and open **Red Team Provider** in the sidebar. Choose the OpenAI provider and the model for your red-team workflow.
4. Under **Advanced Configuration → API Key**, select a team secret containing that project's key, or enter the key directly, then save. Editing requires permission to update providers as well as an enabled team override.

![Red Team Provider settings with team-level overrides enabled for Platform Team and disabled for Support Team](/img/enterprise-docs/team-provider-overrides.png)

Repeat for each team. A shared deployment-level `OPENAI_API_KEY` alone does not separate spend by team. Changing only the [target's credentials](./red-teams.md#creating-targets) also does not configure the models used for test generation and grading.

For automation, see **Get team red team provider override** and **Update team red team provider override** in the [API reference](/docs/api-reference/) for the provider configuration schema and permissions.

### Check generation and grading overrides

The team's Red Team Provider supplies generation and grading unless a separate global provider is configured for that role:

| Workflow        | Provider used                                                                             |
| --------------- | ----------------------------------------------------------------------------------------- |
| Test generation | Global **Test Generation Provider**, otherwise the team's effective **Red Team Provider** |
| Grading         | Global **Grading Provider**, otherwise the team's effective **Red Team Provider**         |

The effective Red Team Provider is the team's saved override when enabled, otherwise the global Red Team Provider. Deployment-level OpenAI defaults can be used when neither is configured.

To inherit each team's credentials, leave the separate global generation and grading providers unset. Review existing settings with the administrator before changing them because they affect other teams. Also check explicit scan or grader overrides. Other workflows, such as translation and agent features, can use their own providers.

### Verify usage and set alerts

Run a small scan with fresh generation and grading requests for each team, then check the corresponding project in the [OpenAI usage dashboard](https://platform.openai.com/usage) after usage reporting updates. Cached results might not produce new billable usage. If the target also uses OpenAI, distinguish its requests from generation and grading when checking attribution.

Configure [project spend alerts in OpenAI](https://developers.openai.com/api/docs/guides/terraform/rate-limits-and-spend), with the desired thresholds and recipients. Alerts notify you; [hard spend limits](https://developers.openai.com/api/docs/guides/spend-limits) are a separate control. Promptfoo's [cost estimates](/docs/providers/openai/#cost-estimates) are not a billing record.

If usage appears in a shared project, check the global role overrides, active team, saved team credentials, and any gateway that replaces credentials. For integrations requiring an explicit project header, the OpenAI provider supports `config.headers["OpenAI-Project"]`; see [connection settings](/docs/providers/openai/#connection-settings). The credential must be authorized for that project.

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
