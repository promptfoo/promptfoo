# API Reference

Complete API documentation for programmatic access to Promptfoo's prompt management system. Use these APIs to integrate prompt management into your applications, CI/CD pipelines, and custom tools.

## Authentication

All API endpoints require authentication:

### Bearer Token

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  https://api.promptfoo.dev/api/managed-prompts
```

### API Key

```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  https://api.promptfoo.dev/api/managed-prompts
```

![API Authentication Flow](../assets/prompt-api-auth-flow.png)

## Base URL

- **Cloud**: `https://api.promptfoo.dev`
- **Self-hosted**: `https://your-domain.com`
- **Local**: `http://localhost:5000`

## Endpoints

### List Prompts

Get a list of all managed prompts.

```http
GET /api/managed-prompts
```

#### Query Parameters

| Parameter | Type     | Description               | Default      |
| --------- | -------- | ------------------------- | ------------ |
| `page`    | integer  | Page number               | 1            |
| `limit`   | integer  | Items per page            | 20           |
| `search`  | string   | Search query              | -            |
| `tags`    | string[] | Filter by tags            | -            |
| `sort`    | string   | Sort field                | `updated_at` |
| `order`   | string   | Sort order (`asc`/`desc`) | `desc`       |

#### Response

```json
{
  "prompts": [
    {
      "id": "customer-support",
      "name": "customer-support",
      "description": "Customer support assistant",
      "currentVersion": 3,
      "createdAt": "2024-01-15T10:00:00Z",
      "updatedAt": "2024-01-20T15:30:00Z",
      "author": "user@example.com",
      "tags": ["support", "production"],
      "deployments": {
        "production": 2,
        "staging": 3
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

### Create Prompt

Create a new managed prompt.

```http
POST /api/managed-prompts
```

#### Request Body

```json
{
  "id": "api-error-handler",
  "description": "Handles API error responses",
  "content": "When an API error occurs: {{error}}\nRespond with a helpful message.",
  "config": {
    "temperature": 0.3,
    "max_tokens": 200
  },
  "contentType": "string",
  "tags": ["api", "error-handling"],
  "label": "API Error Handler"
}
```

#### Response

```json
{
  "id": "api-error-handler",
  "name": "api-error-handler",
  "description": "Handles API error responses",
  "currentVersion": 1,
  "createdAt": "2024-01-20T16:00:00Z",
  "updatedAt": "2024-01-20T16:00:00Z",
  "author": "user@example.com",
  "versions": [
    {
      "id": "api-error-handler-v1",
      "version": 1,
      "content": "When an API error occurs: {{error}}\nRespond with a helpful message.",
      "createdAt": "2024-01-20T16:00:00Z",
      "author": "user@example.com",
      "notes": "Initial version",
      "config": {
        "temperature": 0.3,
        "max_tokens": 200
      },
      "contentType": "string"
    }
  ]
}
```

### Get Prompt

Get a specific prompt with all versions.

```http
GET /api/managed-prompts/:id
```

#### Response

```json
{
  "id": "customer-support",
  "name": "customer-support",
  "description": "Customer support assistant",
  "currentVersion": 3,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-20T15:30:00Z",
  "author": "user@example.com",
  "tags": ["support", "production"],
  "versions": [
    {
      "id": "customer-support-v1",
      "version": 1,
      "content": "You are a helpful support agent.",
      "createdAt": "2024-01-15T10:00:00Z",
      "author": "user@example.com",
      "notes": "Initial version"
    },
    {
      "id": "customer-support-v2",
      "version": 2,
      "content": "You are a helpful support agent for {{company}}.",
      "createdAt": "2024-01-18T14:00:00Z",
      "author": "user@example.com",
      "notes": "Added company variable"
    },
    {
      "id": "customer-support-v3",
      "version": 3,
      "content": "You are a helpful support agent for {{company}}.\n\nGuidelines:\n- Be empathetic\n- Provide solutions\n- Follow up",
      "createdAt": "2024-01-20T15:30:00Z",
      "author": "user@example.com",
      "notes": "Added guidelines",
      "config": {
        "temperature": 0.7
      }
    }
  ],
  "deployments": {
    "production": 2,
    "staging": 3
  }
}
```

### Update Prompt

Create a new version of an existing prompt.

```http
POST /api/managed-prompts/:id/versions
```

#### Request Body

```json
{
  "content": "Updated prompt content with improvements",
  "notes": "Fixed grammar and added error handling",
  "config": {
    "temperature": 0.6,
    "max_tokens": 1500
  },
  "contentType": "string"
}
```

#### Response

Returns the updated prompt object with the new version.

### Deploy Prompt

Deploy a specific version to an environment.

```http
POST /api/managed-prompts/:id/deploy
```

#### Request Body

```json
{
  "environment": "production",
  "version": 3,
  "notes": "Deploying v3 after QA approval"
}
```

#### Response

```json
{
  "promptId": "customer-support",
  "environment": "production",
  "version": 3,
  "deployedAt": "2024-01-20T16:30:00Z",
  "deployedBy": "user@example.com"
}
```

### Get Deployment

Get deployment information for a prompt.

```http
GET /api/managed-prompts/:id/deployments
```

#### Response

```json
{
  "deployments": [
    {
      "environment": "production",
      "version": 2,
      "deployedAt": "2024-01-19T10:00:00Z",
      "deployedBy": "user@example.com"
    },
    {
      "environment": "staging",
      "version": 3,
      "deployedAt": "2024-01-20T15:30:00Z",
      "deployedBy": "user@example.com"
    }
  ]
}
```

### Delete Prompt

Delete a managed prompt (requires admin permissions).

```http
DELETE /api/managed-prompts/:id
```

#### Response

```json
{
  "message": "Prompt deleted successfully",
  "id": "customer-support"
}
```

### Get Diff

Get the diff between two versions.

```http
GET /api/managed-prompts/:id/diff
```

#### Query Parameters

| Parameter | Type    | Description    | Required |
| --------- | ------- | -------------- | -------- |
| `from`    | integer | Source version | Yes      |
| `to`      | integer | Target version | Yes      |

#### Response

```json
{
  "diff": {
    "from": 2,
    "to": 3,
    "changes": [
      {
        "type": "added",
        "line": 3,
        "content": "\nGuidelines:\n- Be empathetic\n- Provide solutions\n- Follow up"
      }
    ],
    "summary": {
      "additions": 4,
      "deletions": 0,
      "modifications": 0
    }
  }
}
```

### Search Prompts

Search prompts by content, description, or metadata.

```http
POST /api/managed-prompts/search
```

#### Request Body

```json
{
  "query": "customer support",
  "filters": {
    "tags": ["support"],
    "author": "user@example.com",
    "contentType": "string",
    "hasConfig": true
  },
  "sort": {
    "field": "relevance",
    "order": "desc"
  },
  "pagination": {
    "page": 1,
    "limit": 10
  }
}
```

### Bulk Operations

Perform operations on multiple prompts.

```http
POST /api/managed-prompts/bulk
```

#### Request Body

```json
{
  "operation": "deploy",
  "prompts": [
    {
      "id": "prompt-1",
      "version": 2
    },
    {
      "id": "prompt-2",
      "version": 1
    }
  ],
  "environment": "staging",
  "notes": "Bulk deployment for feature release"
}
```

## SDK Usage

### JavaScript/TypeScript

```typescript
import { PromptManagementClient } from '@promptfoo/sdk';

const client = new PromptManagementClient({
  apiKey: process.env.PROMPTFOO_API_KEY,
  baseUrl: 'https://api.promptfoo.dev'
});

// List prompts
const prompts = await client.prompts.list({
  tags: ['production'],
  limit: 50
});

// Create a prompt
const newPrompt = await client.prompts.create({
  id: 'welcome-message',
  content: 'Welcome to {{product}}!',
  config: {
    temperature: 0.8
  }
});

// Update a prompt
const updated = await client.prompts.update('welcome-message', {
  content: 'Welcome to {{product}}! How can I help you today?',
  notes: 'Added follow-up question'
});

// Deploy to production
await client.prompts.deploy('welcome-message', {
  environment: 'production',
  version: 2
});
```

### Python

```python
from promptfoo import PromptManagementClient

client = PromptManagementClient(
    api_key=os.environ['PROMPTFOO_API_KEY'],
    base_url='https://api.promptfoo.dev'
)

# List prompts
prompts = client.prompts.list(tags=['production'], limit=50)

# Create a prompt
new_prompt = client.prompts.create(
    id='welcome-message',
    content='Welcome to {{product}}!',
    config={
        'temperature': 0.8
    }
)

# Update a prompt
updated = client.prompts.update(
    'welcome-message',
    content='Welcome to {{product}}! How can I help you today?',
    notes='Added follow-up question'
)

# Deploy to production
client.prompts.deploy(
    'welcome-message',
    environment='production',
    version=2
)
```

### REST Client Examples

#### cURL

```bash
# List prompts
curl -X GET \
  -H "Authorization: Bearer $API_TOKEN" \
  "https://api.promptfoo.dev/api/managed-prompts?tags=production"

# Create prompt
curl -X POST \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-prompt",
    "content": "Test content",
    "description": "Test description"
  }' \
  "https://api.promptfoo.dev/api/managed-prompts"
```

#### HTTPie

```bash
# List prompts
http GET https://api.promptfoo.dev/api/managed-prompts \
  Authorization:"Bearer $API_TOKEN" \
  tags==production

# Create prompt
http POST https://api.promptfoo.dev/api/managed-prompts \
  Authorization:"Bearer $API_TOKEN" \
  id=test-prompt \
  content="Test content" \
  description="Test description"
```

## Webhooks

Configure webhooks to receive notifications about prompt events.

### Event Types

- `prompt.created`
- `prompt.updated`
- `prompt.deployed`
- `prompt.deleted`
- `prompt.rolled_back`

### Webhook Payload

```json
{
  "event": "prompt.deployed",
  "timestamp": "2024-01-20T16:30:00Z",
  "data": {
    "promptId": "customer-support",
    "version": 3,
    "environment": "production",
    "deployedBy": "user@example.com"
  }
}
```

### Configure Webhooks

```http
POST /api/webhooks
```

```json
{
  "url": "https://your-app.com/webhooks/promptfoo",
  "events": ["prompt.deployed", "prompt.updated"],
  "secret": "your-webhook-secret"
}
```

## Rate Limits

API rate limits vary by plan:

| Plan       | Requests/Hour | Burst  |
| ---------- | ------------- | ------ |
| Free       | 100           | 10     |
| Pro        | 1,000         | 100    |
| Enterprise | Custom        | Custom |

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset timestamp

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "PROMPT_NOT_FOUND",
    "message": "Prompt with id 'invalid-id' not found",
    "details": {
      "promptId": "invalid-id"
    }
  },
  "timestamp": "2024-01-20T16:00:00Z",
  "requestId": "req_123456"
}
```

### Error Codes

| Code                | HTTP Status | Description              |
| ------------------- | ----------- | ------------------------ |
| `PROMPT_NOT_FOUND`  | 404         | Prompt does not exist    |
| `VERSION_NOT_FOUND` | 404         | Version does not exist   |
| `INVALID_INPUT`     | 400         | Invalid request data     |
| `UNAUTHORIZED`      | 401         | Missing or invalid auth  |
| `FORBIDDEN`         | 403         | Insufficient permissions |
| `CONFLICT`          | 409         | Resource already exists  |
| `RATE_LIMITED`      | 429         | Too many requests        |
| `SERVER_ERROR`      | 500         | Internal server error    |

## GraphQL API

For complex queries, use our GraphQL endpoint:

```graphql
query GetPromptWithVersions($id: String!) {
  prompt(id: $id) {
    id
    name
    description
    currentVersion
    versions {
      version
      content
      config
      createdAt
      author
    }
    deployments {
      environment
      version
      deployedAt
    }
  }
}
```

## Next Steps

- [SDK Documentation](https://github.com/promptfoo/promptfoo-sdk)
- [OpenAPI Specification](https://api.promptfoo.dev/openapi.json)
- [Postman Collection](https://www.postman.com/promptfoo/workspace/prompt-management)
- [API Playground](https://api.promptfoo.dev/playground) 