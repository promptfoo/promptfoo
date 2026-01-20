# Amazon Bedrock Luma Ray 2 Video Generation

This example demonstrates video generation using Luma Ray 2 through AWS Bedrock.

## Prerequisites

1. AWS account with Bedrock access in us-west-2 (Luma Ray 2 is only available in this region)
2. Luma Ray 2 model access enabled in your account
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
      "Resource": "arn:aws:bedrock:*:*:model/luma.ray-v2:0"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::your-bucket/luma-ray-outputs/*"
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

| Option        | Description                                   | Default |
| ------------- | --------------------------------------------- | ------- |
| `s3OutputUri` | S3 bucket URI for video output (required)     | -       |
| `duration`    | Video duration: "5s" or "9s"                  | "5s"    |
| `resolution`  | Video resolution: "540p" or "720p"            | "720p"  |
| `aspectRatio` | Aspect ratio (see below)                      | "16:9"  |
| `loop`        | Whether video should loop seamlessly          | false   |
| `startImage`  | Starting frame image path (file:// or base64) | -       |
| `endImage`    | Ending frame image path (file:// or base64)   | -       |

### Supported Aspect Ratios

- `1:1` - Square
- `16:9` - Widescreen (default)
- `9:16` - Vertical/mobile
- `4:3` - Standard
- `3:4` - Portrait
- `21:9` - Ultrawide
- `9:21` - Tall ultrawide

## Image-to-Video

Luma Ray supports image-to-video generation using start and/or end frame keyframes:

```yaml
config:
  s3OutputUri: s3://your-bucket/luma-ray-outputs/
  startImage: file://./reference-image.jpg
```

## Video Specifications

- Resolution: 540p or 720p
- Aspect ratios: Multiple options from 1:1 to 21:9
- Duration: 5 or 9 seconds
- Format: MP4

## Timing

Video generation is asynchronous. Expect approximately 2-5 minutes per video. The provider automatically polls for completion.

## Resources

- [AWS Bedrock Luma Ray Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-luma.html)
- [promptfoo AWS Bedrock Provider](https://promptfoo.dev/docs/providers/aws-bedrock)
