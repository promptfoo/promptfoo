# bedrock-video (AWS Bedrock Video Generation)

Video generation examples using AWS Bedrock's async invoke API.

## Available Models

| Model            | Config                           | Region         | Duration  |
| ---------------- | -------------------------------- | -------------- | --------- |
| Amazon Nova Reel | `promptfooconfig.nova-reel.yaml` | us-east-1      | 6s - 2min |
| Luma Ray 2       | `promptfooconfig.luma-ray.yaml`  | us-west-2 only | 5s or 9s  |

## Prerequisites

Video generation requires additional AWS setup beyond standard Bedrock access.

### 1. Enable Model Access

Visit the [AWS Bedrock Model Access page](https://console.aws.amazon.com/bedrock/home#/modelaccess) and enable:

- **Nova Reel**: `amazon.nova-reel-v1:1` (us-east-1)
- **Luma Ray 2**: `luma.ray-v2:0` (us-west-2)

### 2. Create S3 Bucket

Video outputs are written to S3. Create a bucket in the same region as your model:

```bash
# For Nova Reel (us-east-1)
aws s3 mb s3://your-bucket-nova-reel --region us-east-1

# For Luma Ray 2 (us-west-2)
aws s3 mb s3://your-bucket-luma-ray --region us-west-2
```

### 3. Configure IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:StartAsyncInvoke", "bedrock:GetAsyncInvoke"],
      "Resource": [
        "arn:aws:bedrock:*:*:model/amazon.nova-reel-v1:1",
        "arn:aws:bedrock:*:*:model/luma.ray-v2:0"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::your-bucket/*"
    }
  ]
}
```

### 4. Install Dependencies

```bash
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/client-s3
```

## Usage

Update `s3OutputUri` in the config file, then run:

```bash
# Nova Reel
npx promptfoo@latest eval -c promptfooconfig.nova-reel.yaml

# Luma Ray 2
npx promptfoo@latest eval -c promptfooconfig.luma-ray.yaml
```

## Model Comparison

### Amazon Nova Reel

- **Best for**: Longer videos, multi-shot narratives
- **Resolution**: 1280x720 @ 24 FPS
- **Duration**: 6 seconds (single shot) or 12-120 seconds (multi-shot)
- **Features**: TEXT_VIDEO, MULTI_SHOT_AUTOMATED, MULTI_SHOT_MANUAL modes
- **Typical generation time**: ~90 seconds for 6s video

### Luma Ray 2

- **Best for**: High-quality short clips, image-to-video
- **Resolution**: 540p or 720p
- **Aspect ratios**: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9, 9:21
- **Duration**: 5 or 9 seconds
- **Features**: Start/end frame keyframes, loop mode
- **Typical generation time**: ~2-3 minutes

## Configuration Options

### Nova Reel

```yaml
config:
  region: us-east-1
  s3OutputUri: s3://your-bucket/outputs/
  durationSeconds: 6 # 6 for single, 12-120 for multi-shot
  taskType: TEXT_VIDEO # or MULTI_SHOT_AUTOMATED, MULTI_SHOT_MANUAL
  seed: 12345 # Optional, for reproducibility
  image: file://./start-frame.jpg # Optional, for image-to-video
```

### Luma Ray 2

```yaml
config:
  region: us-west-2
  s3OutputUri: s3://your-bucket/outputs/
  duration: '5s' # or '9s'
  resolution: '720p' # or '540p'
  aspectRatio: '16:9'
  loop: false
  startImage: file://./start.jpg # Optional
  endImage: file://./end.jpg # Optional
```

## Resources

- [AWS Bedrock Video Generation](https://docs.aws.amazon.com/bedrock/latest/userguide/video-generation.html)
- [Nova Reel Documentation](https://docs.aws.amazon.com/nova/latest/userguide/video-generation.html)
- [Luma Ray Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-luma.html)
- [promptfoo AWS Bedrock Provider](https://promptfoo.dev/docs/providers/aws-bedrock)
