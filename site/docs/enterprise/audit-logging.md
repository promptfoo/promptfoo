---
title: Audit Logging
description: Track administrative operations in promptfoo Enterprise with comprehensive audit logs for security, compliance, and forensic analysis.
sidebar_label: Audit Logging
keywords: [audit, logging, security, compliance, enterprise, forensics, admin operations]
---

# Audit Logging

Audit Logging is a feature of promptfoo Enterprise that provides forensic access information at the organization level, user level, team level, and service account level.

Audit Logging answers "who, when, and what" questions about promptfoo resources. These answers can help you evaluate the security of your organization, and they can provide information that you need to satisfy audit and compliance requirements.

## Which events are supported by Audit Logging?

Audit Logging captures administrative operations within the promptfoo platform. The system tracks changes to users, teams, roles, permissions, and service accounts within your organization.

Please note that Audit Logging captures operations in the promptfoo control plane and administrative actions. Evaluation runs, prompt testing, and other data plane operations are tracked separately.

## Admin Operation events

The following list specifies the supported events and their corresponding actions:

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
  "metadata": {
    // Additional context-specific information
  },
  "organizationId": "ID of the organization where the action occurred",
  "teamId": "ID of the team (if applicable)",
  "createdAt": "ISO timestamp when the action was recorded"
}
```

### Audit Log Targets

The system tracks changes to the following resource types:

- `USER` - User accounts and profiles
- `ROLE` - Custom roles and permissions
- `TEAM` - Team structures and memberships
- `SERVICE_ACCOUNT` - API service accounts
- `ORGANIZATION` - Organization-level settings

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
  "target": "USER",
  "targetId": "user-123",
  "metadata": null,
  "organizationId": "org-456",
  "teamId": null,
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
  "target": "TEAM",
  "targetId": "team-101",
  "metadata": null,
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
  "target": "ROLE",
  "targetId": "role-202",
  "metadata": {
    "input": {
      "permissions": ["read", "write"],
      "description": "Updated developer permissions"
    }
  },
  "organizationId": "org-456",
  "teamId": null,
  "createdAt": "2023-11-08T10:30:15Z"
}
```

## Accessing Audit Logs

Audit logs are accessible through the promptfoo API. For complete API documentation, see the [API Reference](https://www.promptfoo.dev/docs/api-reference/#tag/audit-logs).

### API Endpoint

```
GET /api/v1/audit-logs
```

### Query Parameters

- `limit` (optional): Number of logs to return (1-100, default: 20)
- `offset` (optional): Number of logs to skip for pagination (default: 0)
- `createdAtGte` (optional): Filter logs created after this ISO timestamp
- `createdAtLte` (optional): Filter logs created before this ISO timestamp
- `action` (optional): Filter by specific action type
- `target` (optional): Filter by specific target type
- `actorId` (optional): Filter by specific user who performed the action

### Authentication

Audit log access requires:

- Valid authentication token
- Organization administrator privileges

### Example API Request

```bash
curl -X GET \
  "https://your-promptfoo-domain.com/api/v1/audit-logs?limit=50&action=login" \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

### Example API Response

```json
{
  "total": 150,
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
      "target": "USER",
      "targetId": "user-123",
      "metadata": null,
      "organizationId": "org-456",
      "teamId": null,
      "createdAt": "2023-11-08T08:06:40Z"
    }
    // ... more log entries
  ]
}
```

## Compliance Usage

Audit logs in promptfoo can help meet various compliance requirements:

- **SOC 2**: Provides detailed access logs and administrative change tracking
- **ISO 27001**: Supports access control monitoring and change management requirements
- **GDPR**: Enables tracking of data access and user management activities
- **HIPAA**: Provides audit trails for access to systems containing protected health information

## Troubleshooting

If you experience issues accessing audit logs:

1. Verify you have organization administrator privileges
2. Check that your API token is valid and has not expired
3. Ensure your query parameters are properly formatted

For additional support, contact the promptfoo support team with details about your specific use case and any error messages received.

## See Also

- [Service Accounts](service-accounts.md) - Create API tokens for accessing audit logs
- [Teams](teams.md) - Learn about team management and permissions
- [Authentication](authentication.md) - Enterprise authentication and security features
- [API Reference](https://www.promptfoo.dev/docs/api-reference/#tag/audit-logs) - Complete audit logs API documentation
