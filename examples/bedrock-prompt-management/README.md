# bedrock-prompt-management (AWS Bedrock Prompt Management Integration)

You can run this example with:

```bash
npx promptfoo@latest init --example bedrock-prompt-management
```

## Overview

This example demonstrates how to use prompts stored in AWS Bedrock Prompt Management with promptfoo evaluations. Instead of storing prompts in files, you can centralize them in AWS Bedrock and reference them by ID.

## Prerequisites

1. **AWS Credentials**: Set up your AWS credentials:

   ```bash
   export AWS_ACCESS_KEY_ID="your_access_key"
   export AWS_SECRET_ACCESS_KEY="your_secret_key"
   export AWS_REGION="us-east-1"  # or AWS_BEDROCK_REGION
   ```

   See [Bedrock authentication docs](https://www.promptfoo.dev/docs/providers/aws-bedrock/#authentication) for other methods (SSO, IAM roles, etc.).

2. **IAM Permissions**: Your AWS credentials need `bedrock:GetPrompt` permission:

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

3. **Install Dependencies**:

   ```bash
   npm install @aws-sdk/client-bedrock-agent @aws-sdk/client-bedrock-runtime
   ```

4. **Create a Prompt in Bedrock**: You need to have prompts created in AWS Bedrock Prompt Management. See the [AWS Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-management.html) or use the example script below.

## Creating a Test Prompt in Bedrock

Use this Python script to create a sample prompt:

```python
import boto3

client = boto3.client('bedrock-agent', region_name='us-east-1')

response = client.create_prompt(
    name='ExamplePlaylistPrompt',
    description='Example prompt for promptfoo testing',
    variants=[
        {
            'name': 'Variant1',
            'modelId': 'amazon.titan-text-express-v1',
            'templateType': 'TEXT',
            'inferenceConfiguration': {
                'text': {
                    'temperature': 0.7
                }
            },
            'templateConfiguration': {
                'text': {
                    'text': 'Make me a {{genre}} playlist consisting of {{number}} songs.'
                }
            }
        }
    ]
)

print(f"Created prompt ID: {response['id']}")
print(f"Prompt ARN: {response['arn']}")

# Create a version
version_response = client.create_prompt_version(
    promptIdentifier=response['id'],
    description='Version 1 - Initial version'
)

print(f"Created version: {version_response['version']}")
```

Save the prompt ID to use in your config.

## Usage

Once you have a prompt ID from Bedrock, reference it in your config:

```yaml
prompts:
  - bedrock://PROMPT12345 # Uses DRAFT version
  - bedrock://PROMPT12345:1 # Uses version 1
  - bedrock://PROMPT12345:DRAFT # Explicitly uses DRAFT
```

## URL Format

- `bedrock://PROMPT_ID` - Fetches DRAFT version
- `bedrock://PROMPT_ID:VERSION` - Fetches specific version (numeric or "DRAFT")
- Region is determined by `AWS_BEDROCK_REGION` or `AWS_REGION` environment variables

## How It Works

1. Promptfoo fetches the prompt template from Bedrock using the GetPrompt API
2. The template (with `{{variables}}` placeholders) is retrieved
3. Promptfoo's Nunjucks engine renders the template with test case variables
4. The rendered prompt is sent to the provider for evaluation

## Benefits

- **Centralized Management**: Store all prompts in one place
- **Version Control**: Use Bedrock's versioning for prompt iterations
- **Team Collaboration**: Share prompts across team members
- **Production Parity**: Evaluate the exact prompts used in production

## Example Test Cases

The included config tests:

- Different music genres (pop, rock, jazz)
- Varying playlist sizes
- Multiple prompt versions side by side

## Running the Example

```bash
# With local build (for development)
npm run local -- eval -c examples/bedrock-prompt-management/promptfooconfig.yaml

# With published version
npx promptfoo@latest eval
```

## Troubleshooting

**Error: ResourceNotFoundException**

- Verify the prompt ID exists in Bedrock
- Check you're using the correct region
- Ensure the prompt version exists (if specified)

**Error: AccessDeniedException**

- Verify your AWS credentials have `bedrock:GetPrompt` permission
- Check the resource policy on the prompt allows access

**Error: Module not found**

- Run `npm install @aws-sdk/client-bedrock-agent`

## Related Documentation

- [Bedrock Prompt Management Docs](https://www.promptfoo.dev/docs/integrations/bedrock-prompt-management/)
- [AWS Bedrock Prompt Management](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-management.html)
- [Bedrock Provider Docs](https://www.promptfoo.dev/docs/providers/aws-bedrock/)
