# AWS Bedrock Setup for Llama 4 Scout

This guide helps you set up AWS Bedrock access to use Llama 4 Scout in the AI Fairness Evaluation.

## Prerequisites

1. AWS Account with Bedrock access
2. IAM user with appropriate permissions
3. Access to Llama 4 models in Bedrock (request access if needed)

## Step 1: Request Model Access

1. Go to the AWS Bedrock console
2. Navigate to "Model access" in the left menu
3. Find "Meta Llama 4 Scout 17B" in the model list
4. Click "Request access" if not already granted
5. Access is typically granted immediately

## Step 2: Create IAM Credentials

1. Go to IAM Console
2. Create a new user or use existing one
3. Attach the following policy:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "bedrock:InvokeModel",
                "bedrock:InvokeModelWithResponseStream"
            ],
            "Resource": [
                "arn:aws:bedrock:us-east-1:*:model/us.meta.llama4-scout-17b-instruct-v1/*",
                "arn:aws:bedrock:us-west-2:*:model/us.meta.llama4-scout-17b-instruct-v1/*"
            ]
        }
    ]
}
```

## Step 3: Configure Environment Variables

```bash
export AWS_ACCESS_KEY_ID=your_access_key_here
export AWS_SECRET_ACCESS_KEY=your_secret_key_here
export AWS_REGION=us-east-1  # or us-west-2
```

## Available Regions

Llama 4 Scout is available in:
- `us-east-1` (N. Virginia)
- `us-west-2` (Oregon)
- `us-east-2` (Ohio) via cross-region inference

## Model Details

- **Model ID**: `us.meta.llama4-scout-17b-instruct-v1:0`
- **Parameters**: 109B total (17B active, 16 experts)
- **Context Window**: 10M tokens
- **Capabilities**: Text and image understanding
- **Languages**: 12 languages for text, English for images

## Troubleshooting

### Access Denied Error
- Ensure your IAM user has the correct permissions
- Verify model access is granted in Bedrock console
- Check that your region matches the model availability

### Invalid Model ID
- Use the exact model ID: `us.meta.llama4-scout-17b-instruct-v1:0`
- Ensure you're in a supported region

### Rate Limits
- Default: 1000 requests per minute
- Contact AWS support to increase limits if needed

## Cost Estimation

Llama 4 Scout pricing on Bedrock:
- Input: $0.00195 per 1K tokens
- Output: $0.00256 per 1K tokens

For the full evaluation (60 questions):
- Estimated cost: < $1.00

## Additional Resources

- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Meta Llama 4 Announcement](https://aws.amazon.com/blogs/aws/llama-4-models-from-meta-now-available-in-amazon-bedrock-serverless/)
- [Promptfoo Bedrock Provider Docs](https://promptfoo.dev/docs/providers/aws-bedrock/) 