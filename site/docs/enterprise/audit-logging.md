---
title: Audit Logging
description: Track administrative operations in promptfoo Enterprise with comprehensive audit logs for security, compliance, and forensic analysis.
sidebar_label: Audit Logging
keywords: [audit, logging, security, compliance, enterprise, forensics, admin operations]
---

# Audit Logging

Audit Logging is a feature of [Promptfoo Enterprise](/docs/enterprise/) that provides forensic access information at the organization level, user level, team level, and service account level.

Audit Logging answers "who, when, and what" questions about promptfoo resources. These answers can help you evaluate the security of your organization, and they can provide information that you need to satisfy audit and compliance requirements.

## Which events are supported by Audit Logging?

Audit Logging captures administrative operations within the promptfoo platform. The system tracks changes to users, teams, roles, permissions, and service accounts within your organization.

Please note that Audit Logging captures operations in the promptfoo control plane and administrative actions. Evaluation runs, prompt testing, and other data plane operations are tracked separately.

## Admin Operation events

The following sections highlight supported events. For the complete action and target values, see **List audit logs** in the [API reference](/docs/api-reference/).

### Authentication

- **User Login**: `login` - Tracks when users successfully authenticate to the platform

### User Management

- **User Added**: `user_added` - Records when new users are invited or added to the organization
- **User Removed**: `user_removed` - Logs when users are removed from the organization

### Role Management

- **Role Created**: `role_created` - Captures creation of new custom roles
- **Role Updated**: `role_updated` - Records changes to existing role permissions
- **Role Deleted**: `role_deleted` - Logs deletion of custom roles

### Team Management

- **Team Created**: `team_created` - Records creation of new teams
- **Team Deleted**: `team_deleted` - Logs team deletion
- **User Added to Team**: `user_added_to_team` - Tracks when users join teams
- **User Removed from Team**: `user_removed_from_team` - Records when users leave teams
- **User Role Changed in Team**: `user_role_changed_in_team` - Logs role changes within teams

### Permission Management

- **System Admin Added**: `org_admin_added` - Records when system admin permissions are granted
- **System Admin Removed**: `org_admin_removed` - Logs when system admin permissions are revoked

### Service Account Management

- **Service Account Created**: `service_account_created` - Tracks creation of API service accounts
- **Service Account Deleted**: `service_account_deleted` - Records deletion of service accounts

### Other administrative changes

- **API tokens**: `api_token_created` and `api_token_revoked` track token creation and revocation.
- **Team secrets**: `team_secret_created`, `team_secret_updated`, `team_secret_deleted`, and `team_secret_assigned` track secret management and target assignments.
- **Inference providers**: `team_inference_provider_updated` and `team_redteam_provider_updated` track changes to a team's inference settings.
- **Targets**: `provider_created`, `provider_updated`, `provider_deleted`, and `provider_moved_team` track saved target changes.
- **Webhooks**: `webhook_created`, `webhook_updated`, `webhook_deleted`, and `webhook_secret_regenerated` track configuration and signing-secret changes.
- **Report visibility**: `eval_visibility_changed` tracks changes to an eval's public visibility.

## Audit Log format

The audit log entries are stored in JSON format with the following structure:

```json
{
  "id": "unique-log-entry-id",
  "description": "Human-readable description of the action",
  "actorId": "ID of the user who performed the action",
  "actorName": "Name of the user who performed the action",
  "actorEmail": "Email of the user who performed the action",
  "action": "Machine-readable action identifier",
  "actionDisplayName": "Human-readable action name",
  "target": "Type of resource that was affected",
  "targetId": "ID of the specific resource that was affected",
  "metadata": {},
  "organizationId": "ID of the organization where the action occurred",
  "teamId": "ID of the team (if applicable)",
  "createdAt": "ISO timestamp when the action was recorded"
}
```

### Audit Log Targets

The API uses lowercase target values, including:

- `user` - User accounts and profiles
- `role` - Custom roles and permissions
- `team` - Team structures and memberships
- `service_account` - API service accounts
- `organization` - Organization-level settings
- `team_secret`, `api_token` - Team secrets and API tokens
- `provider`, `webhook`, `eval` - Saved targets, webhooks, and evals

## Example Audit Log Entries

The following examples show the contents of various audit log entries:

### User Login

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "description": "john.doe@example.com logged in",
  "actorId": "user-123",
  "actorName": "John Doe",
  "actorEmail": "john.doe@example.com",
  "action": "login",
  "actionDisplayName": "User Login",
  "target": "user",
  "targetId": "user-123",
  "organizationId": "org-456",
  "createdAt": "2023-11-08T08:06:40Z"
}
```

### Team Creation

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "description": "jane.smith@example.com created team Engineering",
  "actorId": "user-789",
  "actorName": "Jane Smith",
  "actorEmail": "jane.smith@example.com",
  "action": "team_created",
  "actionDisplayName": "Team Created",
  "target": "team",
  "targetId": "team-101",
  "organizationId": "org-456",
  "teamId": "team-101",
  "createdAt": "2023-11-08T09:15:22Z"
}
```

### Role Update

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "description": "admin@example.com updated role Developer",
  "actorId": "user-456",
  "actorName": "Admin User",
  "actorEmail": "admin@example.com",
  "action": "role_updated",
  "actionDisplayName": "Role Updated",
  "target": "role",
  "targetId": "role-202",
  "metadata": {
    "input": {
      "permissions": ["read", "write"],
      "description": "Updated developer permissions"
    }
  },
  "organizationId": "org-456",
  "createdAt": "2023-11-08T10:30:15Z"
}
```

## Accessing Audit Logs

Audit logs are available in the UI and API to organization administrators. Results belong to the authenticated organization and appear newest first.

### Investigate in the UI

1. Open the profile menu, select **Organization Settings**, then **Audit Logs**.
2. Set **Start Date** and **End Date** around the event you are investigating. These fields use your browser's local time.
3. Optionally enter an **Actor ID** and select **Action** and **Target**, then click **Apply Filters**. For example, choose **User Login** and **User** to investigate an account's sign-ins. Actor ID is the user's ID, not their email address.
4. Review **Date**, **Actor**, **Actor Email**, **Description**, and **Target ID**. Use pagination for more results; **Clear Filters** resets the investigation.

All supplied filters must match. **Target** selects a resource type, not a particular resource ID; inspect **Target ID** in the results to identify the affected resource. The API also returns event-specific `metadata`.

[![Audit logs filtered by actor, User Login action, User target, and a bounded date window](/img/enterprise-docs/audit-log-filters.png)](/img/enterprise-docs/audit-log-filters.png)

An account sign-in investigation using synthetic users and audit events.

### API Endpoint

```
GET /api/v1/audit-logs
```

### Query Parameters

- `limit` (optional): Number of logs to return (1-100, default: 20)
- `offset` (optional): Number of logs to skip for pagination (default: 0)
- `createdAtGte` (optional): Include logs created at or after this ISO timestamp
- `createdAtLte` (optional): Include logs created at or before this ISO timestamp
- `action` (optional): Filter by specific action type
- `target` (optional): Filter by specific target type
- `actorId` (optional): Filter by specific user who performed the action

Use ISO 8601 timestamps with an explicit timezone, such as `2026-10-09T00:00:00Z`. Unparseable date strings are ignored, so verify both bounds before relying on the result. Invalid action or target values return HTTP 400.

See **List audit logs**, `AuditAction`, `AuditTarget`, and `AuditLogQueryParams` in the [API reference](/docs/api-reference/). On-prem installations serve their release's schema at `/static/openapi.json`; prefer that copy when it differs from the public reference.

### Authentication

Audit log access requires:

- Valid authentication token
- Organization administrator privileges

Team-scoped API tokens cannot read organization audit logs, even when their owner is an administrator. Use an administrator session in the UI or an organization-wide API token belonging to an organization administrator.

### Example API Request

Supply `PROMPTFOO_API_KEY` through your secret manager, replace the API hostname and actor ID, and choose the investigation's UTC time window:

```bash
curl --fail-with-body --get \
  "https://promptfoo.example.com/api/v1/audit-logs" \
  -H "Authorization: Bearer $PROMPTFOO_API_KEY" \
  --data-urlencode "createdAtGte=2026-10-09T00:00:00Z" \
  --data-urlencode "createdAtLte=2026-10-09T23:59:59.999Z" \
  --data-urlencode "actorId=user-123" \
  --data-urlencode "action=login" \
  --data-urlencode "target=user" \
  --data-urlencode "limit=50" \
  --data-urlencode "offset=0"
```

`total` counts all matching entries; `logs` contains only the requested page. Keep the same filters and increase `offset` by `limit` to retrieve subsequent pages.

### Example API Response

```json
{
  "total": 1,
  "limit": 50,
  "offset": 0,
  "logs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "description": "john.doe@example.com logged in",
      "actorId": "user-123",
      "actorName": "John Doe",
      "actorEmail": "john.doe@example.com",
      "action": "login",
      "actionDisplayName": "User Login",
      "target": "user",
      "targetId": "user-123",
      "organizationId": "org-456",
      "createdAt": "2026-10-09T08:06:40Z"
    }
  ]
}
```

## Compliance Usage

Audit logs in promptfoo can help meet various compliance requirements:

- **SOC 2**: Provides detailed access logs and administrative change tracking
- **ISO 27001**: Supports access control monitoring and change management requirements
- **Data protection reviews**: Helps track data access and user management activities
- **HIPAA**: Provides audit trails for access to systems containing protected health information

## Troubleshooting

If you experience issues accessing audit logs:

1. Verify you are in the intended organization and have organization administrator privileges; a team-scoped token is insufficient.
2. Check that your API token is valid and has not expired
3. Check the date window, actor ID, and lowercase action/target values. Remove filters one at a time if the result is empty.

For additional support, contact the promptfoo support team with details about your specific use case and any error messages received.

## See Also

- [Service Accounts](service-accounts.md) - Create API tokens for accessing audit logs
- [Teams](teams.md) - Learn about team management and permissions
- [Authentication](authentication.md) - Enterprise authentication and security features
- [API Reference](/docs/api-reference/) - Complete audit logs API documentation
