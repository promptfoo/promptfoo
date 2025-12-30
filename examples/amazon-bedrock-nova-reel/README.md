# Amazon Nova Reel Video Generation

This example demonstrates video generation using Amazon Nova Reel through AWS Bedrock.

## Prerequisites

1. AWS account with Bedrock access in us-east-1
2. Nova Reel model access enabled in your account
3. S3 bucket for video output with appropriate permissions
4. AWS credentials configured (via environment variables, AWS CLI, or IAM role)

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:StartAsyncInvoke", "bedrock:GetAsyncInvoke"],
      "Resource": "arn:aws:bedrock:*:*:model/amazon.nova-reel-v1:1"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::your-bucket/nova-reel-outputs/*"
    }
  ]
}
```

## Setup

1. Update `s3OutputUri` in `promptfooconfig.yaml` to point to your S3 bucket
2. Ensure AWS credentials are configured
3. Run the evaluation:

```bash
npx promptfoo@latest eval
```

## Configuration Options

| Option            | Description                                            | Default    |
| ----------------- | ------------------------------------------------------ | ---------- |
| `s3OutputUri`     | S3 bucket URI for video output (required)              | -          |
| `taskType`        | TEXT_VIDEO, MULTI_SHOT_AUTOMATED, or MULTI_SHOT_MANUAL | TEXT_VIDEO |
| `durationSeconds` | Video duration in seconds                              | 6          |
| `seed`            | Random seed for reproducibility                        | -          |
| `image`           | Starting frame image path                              | -          |

## Task Types

### TEXT_VIDEO (default)

Generates a single 6-second video from a text prompt.

### MULTI_SHOT_AUTOMATED

Generates longer videos (12-120 seconds) by automatically breaking down the prompt into scenes.

```yaml
config:
  taskType: MULTI_SHOT_AUTOMATED
  durationSeconds: 24 # Must be multiple of 6
```

### MULTI_SHOT_MANUAL

Manually define each scene for precise control:

```yaml
config:
  taskType: MULTI_SHOT_MANUAL
  durationSeconds: 12
  shots:
    - text: 'Opening scene: sunrise over mountains'
    - text: 'Closing scene: sunset reflection in lake'
```

## Video Specifications

- Resolution: 1280x720
- Frame rate: 24 FPS
- Format: MP4
- Duration: 6 seconds (single) or up to 2 minutes (multi-shot)

## Timing

Video generation is asynchronous. Expect approximately:

- 6-second video: ~90 seconds
- 2-minute video: ~14-17 minutes

The provider automatically polls for completion.

## Resources

- [AWS Bedrock Nova Reel Documentation](https://docs.aws.amazon.com/nova/latest/userguide/video-generation.html)
- [promptfoo AWS Bedrock Provider](https://promptfoo.dev/docs/providers/aws-bedrock)
