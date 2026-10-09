---
sidebar_label: On-Prem SSO
sidebar_position: 11
title: Configure SSO for Promptfoo Enterprise On-Prem
description: Connect your on-prem Promptfoo deployment to a SAML or OIDC identity provider, map teams and roles, and verify access before enabling automated assignments.
---

# Configure SSO for Promptfoo Enterprise On-Prem

On-prem deployments use your FusionAuth service to connect to a SAML 2.0 or OpenID Connect (OIDC) identity provider. Use your deployment's authentication URL and the instructions packaged with your release. Hosted authentication is covered in [Authentication](./authentication.md).

## Connect your identity provider

1. Confirm that Promptfoo and FusionAuth are running, their browser-facing URLs and TLS are configured, and you can sign in as an administrator. Keep a working administrator login available while testing SSO.
2. Open your FusionAuth administration console, for example `https://auth.promptfoo.example.com/admin`. Under **Settings → Identity Providers**, add your provider using FusionAuth's [OIDC](https://fusionauth.io/docs/lifecycle/authenticate-users/identity-providers/overview-oidc) or [SAML v2](https://fusionauth.io/docs/lifecycle/authenticate-users/identity-providers/overview-samlv2) instructions. Use the callback and integration details for your authentication hostname.
3. Enable the provider for the existing **Promptfoo** application. Enable **Create registration** if IdP users should be registered for that application automatically; otherwise register them before login. This is separate from assigning Promptfoo teams and roles.
4. Test an IdP login from the Promptfoo application with a non-administrator user already in the intended organization before changing team-management behavior.

## Choose who manages teams and roles

As an organization administrator, open the **Organization** settings page and find **SSO Settings → Role Management Mode**. These controls require an on-prem deployment with FusionAuth enabled.

| Mode                                                | Team membership                    | Roles within teams                                                                                       |
| --------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Manage Teams and Roles Manually**                 | Managed in Promptfoo               | Managed in Promptfoo; IdP team assignments are ignored                                                   |
| **Use Identity Provider for Team Assignment Only**  | Synchronized from the IdP at login | Select a **Default Role for New Users** for new team memberships; existing roles remain manually managed |
| **Use Identity Provider for Roles and Permissions** | Synchronized from the IdP at login | Synchronized from the IdP at login                                                                       |

Create the [teams and roles](./teams.md) you will reference before enabling either IdP-managed mode. Copy their actual slugs or UUIDs; display names are not mapping identifiers. Review the confirmation dialog before applying the change.

## Map the FusionAuth user data

Configure your IdP integration to populate these fields on the FusionAuth **user's `data` object**. An incoming IdP claim alone is not sufficient: map it to the user data, for example with an [OIDC reconcile lambda](https://fusionauth.io/docs/extend/code/lambdas/reconcile/openid-connect-response-reconcile) or [SAML reconcile lambda](https://fusionauth.io/docs/extend/code/lambdas/reconcile/samlv2-response-reconcile).

| Field                      | Value                                                       |
| -------------------------- | ----------------------------------------------------------- |
| `defaultOrganizationId`    | The UUID of the intended Promptfoo organization             |
| `promptfooRoleAssignments` | An array of assignment strings, or a comma-separated string |

Set `defaultOrganizationId` explicitly to select the intended organization, especially when a user belongs to multiple organizations. Any configured allowed-email-domain restriction must also match the user's email. Verify the organization selected after login before testing team assignments.

For **team assignment only**, use:

```text
promptfoo:team=customer_support
```

For **team and role assignment**, include the role:

```text
promptfoo:team=customer_support:role=results_viewer
```

For example, the resulting FusionAuth `user.data` could be:

```json
{
  "defaultOrganizationId": "<promptfoo-organization-uuid>",
  "promptfooRoleAssignments": [
    "promptfoo:team=customer_support:role=results_viewer",
    "promptfoo:team=platform_engineering:role=results_viewer"
  ]
}
```

Replace the example slugs and organization UUID with your existing values. Teams and roles must belong to that organization. `team=*` assigns all of its teams; use explicit team slugs when access should be narrower. Assign only one role per team.

## Understand synchronization

In either IdP-managed mode on-prem, synchronization removes memberships in teams omitted from the parsed assignment list. An empty array (`[]`), or a list containing only unrelated IdP groups or the ignored `promptfoo:org-admin` marker, removes all team memberships in that organization. A missing field or empty string skips synchronization and retains existing memberships. Send the intended Promptfoo team assignments, not an unfiltered list of IdP groups.

:::warning Validate assignments before enabling synchronization

Invalid mappings do not reliably reject login or leave memberships unchanged. Entries with unknown teams or invalid formats are omitted from the parsed list, so existing team memberships can be removed. Missing roles or a missing team-only default role can prevent additions after removals have already occurred. Test the complete assignment list with a non-administrator account before applying it to users.

:::

Team-role synchronization does not grant organization administrator access. The legacy `promptfoo:org-admin` assignment is ignored; manage organization administrators separately in Promptfoo. Service accounts are excluded from IdP team synchronization.

Changes take effect through login synchronization. Updating IdP groups is not an immediate revocation mechanism for already-issued credentials. Follow your deployment's account and credential offboarding process when removing access.

## Validate and troubleshoot

Test with a non-administrator account that represents your intended permissions:

1. Sign in through the IdP and confirm the expected organization, teams, and accessible targets.
2. In team-only mode, verify a newly assigned team receives the selected default role. In team-and-role mode, verify the mapped role's permissions.
3. Remove one test assignment, perform a fresh IdP login, and confirm that team membership is removed. Keep the administrator recovery login available.

If login succeeds but teams or roles are wrong, inspect the resulting FusionAuth user data, organization UUID, existing slugs, and role-management mode. Check server logs for skipped assignments, and use only one role per team. A successful login does not prove that every assignment was applied.

Follow the FusionAuth configuration and upgrade instructions packaged with your deployment. `/health` readiness alone does not validate an end-to-end IdP login; complete the login and permission checks above after changes.

For automation, see **Organizations** in the [API reference](/docs/api-reference/). `PATCH /api/v1/organizations/{id}` accepts `roleManagementMode` (`promptfoo`, `team_only`, or `idp`) and `defaultTeamOnlyRoleId`; use a role from the same organization. Prefer your installation's `/static/openapi.json` when its release differs from the public reference.
