---
sidebar_label: AWS Bedrock Prompt Management
description: Integrate AWS Bedrock Prompt Management with Promptfoo for LLM testing. Reference prompts by ID and version, with automatic variable substitution and team collaboration.
---

# AWS Bedrock Prompt Management

[AWS Bedrock Prompt Management](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-management.html) allows you to create, version, and manage prompts for foundation models in Amazon Bedrock.

## Setup

1. Install the AWS SDK:

   ```bash
   npm install @aws-sdk/client-bedrock-agent
   ```

2. Configure AWS credentials using one of these methods:

   **Environment variables:**

   ```bash
   export AWS_ACCESS_KEY_ID="your-access-key"
   export AWS_SECRET_ACCESS_KEY="your-secret-key"
   export AWS_REGION="us-east-1"  # or AWS_BEDROCK_REGION
   ```

   **AWS CLI:**

   ```bash
   aws configure
   ```

   **SSO:**

   ```bash
   aws configure sso
   export AWS_PROFILE="your-sso-profile"
   ```

3. Ensure your credentials have the `bedrock:GetPrompt` permission:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["bedrock:GetPrompt"],
         "Resource": "arn:aws:bedrock:*:*:prompt/*"
       }
     ]
   }
   ```

## Using Bedrock prompts

Use the `bedrock://` prefix to reference prompts stored in Bedrock Prompt Management.

### Prompt formats

Reference prompts by ID with optional version:

```yaml
bedrock://PROMPT_ID[:VERSION]
```

Where:

- `PROMPT_ID`: The alphanumeric ID of your prompt in Bedrock (e.g., `PROMPT12345`)
- `VERSION`: (Optional) Version number or `DRAFT` (defaults to `DRAFT` if omitted)

### Examples

```yaml
prompts:
  - bedrock://PROMPT12345 # DRAFT version
  - bedrock://PROMPT12345:1 # Version 1
  - bedrock://PROMPT12345:2 # Version 2
  - bedrock://PROMPT12345:DRAFT # Explicitly DRAFT

providers:
  # Works with both bedrock: and bedrock-converse: providers
  - bedrock:us.anthropic.claude-3-5-sonnet-20241022-v2:0
  - bedrock-converse:amazon.titan-text-express-v1

tests:
  - vars:
      genre: pop
      number: 5
  - vars:
      genre: rock
      number: 3
```

### Variable substitution

Variables from your promptfoo test cases are automatically substituted into Bedrock prompts. If your Bedrock prompt contains variables like `{{genre}}` or `{{number}}`, they will be replaced with the corresponding values from your test cases.

Bedrock uses Mustache-style `{{variable}}` syntax, which is compatible with promptfoo's Nunjucks templating.

### Template types

Bedrock supports two template types:

**TEXT prompts:**

Returns the template string directly:

```
Create a {{genre}} playlist with {{number}} songs.
```

**CHAT prompts:**

Returns a JSON array of messages:

```json
[
  {
    "role": "system",
    "content": "You are a helpful assistant."
  },
  {
    "role": "user",
    "content": "Tell me about {{topic}}"
  }
]
```

## Region configuration

The region is determined in this priority order:

1. `AWS_BEDROCK_REGION` environment variable
2. `AWS_REGION` environment variable
3. Default: `us-east-1`

Example:

```bash
export AWS_BEDROCK_REGION="us-west-2"
npx promptfoo eval
```

## Creating prompts in Bedrock

You can create prompts using the AWS Console, AWS CLI, or SDKs.

### Using the AWS Console

1. Navigate to [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/)
2. Select **Prompt Management** from the sidebar
3. Click **Create prompt**
4. Define your prompt with variables using `{{variable}}` syntax
5. Create versions for production use

### Using the AWS CLI

```bash
aws bedrock-agent create-prompt \
  --name "my-prompt" \
  --variants '[{
    "name": "variant1",
    "modelId": "amazon.titan-text-express-v1",
    "templateType": "TEXT",
    "templateConfiguration": {
      "text": {
        "text": "Create a {{genre}} playlist with {{number}} songs."
      }
    },
    "inferenceConfiguration": {
      "text": {
        "temperature": 0.7
      }
    }
  }]'
```

### Using the SDK

See the [example script](https://github.com/promptfoo/promptfoo/tree/main/examples/bedrock-prompt-management/create_test_prompt.py) in the promptfoo repository.

## Version management

Bedrock Prompt Management supports versioning:

- **DRAFT**: Mutable version for development and testing
- **Numbered versions** (1, 2, 3, ...): Immutable snapshots for production

### Creating versions

```bash
aws bedrock-agent create-prompt-version \
  --prompt-identifier PROMPT12345 \
  --description "Version 1 - Initial release"
```

### Version-based deployment

Use versioned prompts for production to ensure consistency:

```yaml
prompts:
  # Development: use DRAFT
  - bedrock://PROMPT12345

  # Production: use numbered version
  - bedrock://PROMPT12345:1
```

## Benefits

- **Centralized management**: Store all prompts in AWS
- **Version control**: Built-in versioning with immutable snapshots
- **Team collaboration**: Share prompts across team members
- **Production parity**: Eval the exact prompts used in production
- **AWS integration**: Works seamlessly with other AWS services

## Comparison with other integrations

| Feature               | Bedrock         | Langfuse    | Portkey     |
| --------------------- | --------------- | ----------- | ----------- |
| Versioning            | ✅ Built-in     | ✅ Built-in | ✅ Built-in |
| Labels                | ❌              | ✅          | ❌          |
| Self-hosted           | ❌ AWS only     | ✅          | ❌          |
| Variable substitution | ✅              | ✅          | ✅          |
| Multi-variant support | ✅ (MVP: first) | ✅          | ✅          |

## Troubleshooting

### ResourceNotFoundException

```
Bedrock prompt "PROMPT12345" not found in region us-east-1
```

**Solutions:**

- Verify the prompt ID exists in Bedrock
- Check you're using the correct region
- Ensure the version exists (if specified)

### AccessDeniedException

```
Access denied to Bedrock prompt "PROMPT12345"
```

**Solutions:**

- Verify your AWS credentials have `bedrock:GetPrompt` permission
- Check IAM policies and resource-based policies
- Ensure the prompt is in the same account

### Module not found

```
Cannot find module '@aws-sdk/client-bedrock-agent'
```

**Solution:**

```bash
npm install @aws-sdk/client-bedrock-agent
```

## Additional resources

- [AWS Bedrock Prompt Management Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-management.html)
- [Bedrock Provider Documentation](/docs/providers/aws-bedrock/)
- [Example Configuration](https://github.com/promptfoo/promptfoo/tree/main/examples/bedrock-prompt-management/)
