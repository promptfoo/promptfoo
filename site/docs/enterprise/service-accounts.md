---
sidebar_label: Service Accounts
sidebar_position: 30
title: Creating and Managing Service Accounts in Promptfoo Enterprise
description: Manage service accounts and API keys for automated CI/CD integration and programmatic access to Promptfoo Enterprise features
keywords: [service accounts, api keys, programmatic access, ci/cd integration, automation]
---

# Service Accounts

Service accounts allow you to create API keys for programmatic access to [Promptfoo Enterprise](/docs/enterprise/). These are useful for CI/CD pipelines and automated testing.

:::note

Only organization administrators can create service accounts and assign them to teams.

:::

To create a service account:

1. Navigate to your Organization Settings page
2. Click on the "Users" tab and then select "Create Service Account"

<div style={{ textAlign: 'center' }}>
    <img src="/img/enterprise-docs/create-service-account.png" alt="Create Service Account screen" style={{ width: '80%' }} />
</div>
3. Enter a name for your service account and save the API key in a secure location.
<div style={{ textAlign: 'center' }}>
    <img src="/img/enterprise-docs/service-account-api-key.png" alt="Service Account API key" style={{ width: '80%' }} />
</div>
:::warning
Make sure to copy your API key when it's first created. For security reasons, you won't be able to view it again after closing the dialog.
:::
4. Leave global admin privileges disabled for ordinary CI jobs. Global admin access is only needed for organization-wide administration, such as managing teams, roles, users, and webhooks.
5. Assign the service account to a team by navigating to the "Teams" tab, selecting the team, and opening "Service Accounts". A non-admin service account's access to team resources is controlled by its assigned role.

[![The support-ci service account assigned to a Support CI role](/img/enterprise-docs/service-account-team-role.png)](/img/enterprise-docs/service-account-team-role.png)

The Customer Support team's service accounts, shown with synthetic data.

6. Select the role for the service account for that team.

## Choosing a Credential

Use a service account for a pipeline owned by a team. Use a personal API token when automation should act as an individual user.

|                            | Service account key                                  | Personal API token                                             |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| Identity                   | Dedicated service account                            | The user who created the token                                 |
| Lifetime                   | Does not expire                                      | Optional expiration, including a non-expiring option           |
| Access                     | Assigned teams and roles                             | The user's access, optionally restricted to one team           |
| Replacement and retirement | Create a replacement account; delete the old account | Create a replacement token; delete the old token in API Tokens |

Assign the service account only to the teams the pipeline needs. For the local eval upload below, choose a role with **Create Evaluations**. A pipeline that starts server-side scans also needs **Run Scans**. See [Managing Roles and Teams](./teams.md) for role configuration.

## Using a Service Account in CI

Run this example on a trusted ephemeral runner with process-argument capture disabled. The login command passes the key as an argument. Configure the CI platform to destroy the runner after every job, including forced cancellation.

Install your chosen Promptfoo CLI version in the runner and store the service account key as the CI secret `PROMPTFOO_API_KEY`. Keep shell tracing disabled so the login command does not print the key.

For an on-prem deployment, use its API origin for `--host` and the assigned team's name, slug, or ID for `--team`:

```bash
set +x
set -euo pipefail

export PROMPTFOO_CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "$PROMPTFOO_CONFIG_DIR"' EXIT

promptfoo auth login \
  --host https://promptfoo-api.example.com \
  --api-key "$PROMPTFOO_API_KEY" \
  --team customer-support
promptfoo auth whoami
eval_status=0
promptfoo eval -c promptfooconfig.yaml --no-share || eval_status=$?
promptfoo share
exit "$eval_status"
```

This runs the eval on the CI runner and uploads its results to the selected team. The upload is attempted even when tests fail, and the job fails if either the eval or upload fails. Provide the target's credentials separately, as required by `promptfooconfig.yaml`; the service account key authenticates to Promptfoo.

Login saves the credential in the CLI configuration directory. The temporary directory's `EXIT` trap cleans up on normal exit; forced termination can skip the trap, so runner destruction is required. Do not cache or upload the directory as an artifact. See [CLI authentication](./authentication.md#authenticating-into-the-cli) and [CI/CD integration](/docs/integrations/ci-cd/) for the surrounding setup.

## Replacing a Service Account Key

Replace the account when its key needs to change:

1. Create a replacement service account and assign the required team roles, leaving global admin disabled for CI.
2. Update the CI secret. Log in with the replacement key, verify the organization and team with `promptfoo auth whoami`, and confirm a representative job can upload results to that team.
3. After all consumers use the replacement, delete the old service account from Organization Settings. Removing only a team assignment removes that team's access; it does not retire the account's access to other teams.

Personal API tokens have a separate lifecycle: create a replacement under **API Tokens**, verify it, then delete the old token there. Logging out of the CLI only clears the local login; it does not revoke either credential.

## See Also

- [Managing Roles and Teams](./teams.md)
- [Authentication](./authentication.md)
