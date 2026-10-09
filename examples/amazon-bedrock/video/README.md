# amazon-bedrock/video (AWS Bedrock Video Generation)

You can run this example with:

```bash
npx promptfoo@latest init --example amazon-bedrock/video
cd amazon-bedrock/video
```

Video generation examples using AWS Bedrock's async invoke API.

> **Retired-model reference:** Nova Reel reached [end of life on September 30, 2026](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html). Its configuration is retained for reference and private extended-access workloads. Use an Active model for new evaluations; model migrations are not automatic.

## Available Models

| Model                      | Config                           | Region         | Duration  |
| -------------------------- | -------------------------------- | -------------- | --------- |
| Amazon Nova Reel (retired) | `promptfooconfig.nova-reel.yaml` | us-east-1      | 6s - 2min |
| Luma Ray 2                 | `promptfooconfig.luma-ray.yaml`  | us-west-2 only | 5s or 9s  |

## Prerequisites

Video generation requires additional AWS setup beyond standard Bedrock access.

### 1. Check Model Access

Check the [Luma Ray 2 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-luma-ai-ray2.html) for current availability and account requirements. This example uses `luma.ray-v2:0` in `us-west-2`.

### 2. Create S3 Bucket

Video outputs are written to S3. Create a bucket in the same region as your model:

```bash
# For Luma Ray 2 (us-west-2)
aws s3 mb s3://your-bucket-luma-ray --region us-west-2
```

### 3. Configure IAM Permissions

Replace the account and bucket below with your own. [StartAsyncInvoke](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_StartAsyncInvoke.html) uses `bedrock:InvokeModel`; polling authorizes against the separate async invocation resource.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-west-2::foundation-model/luma.ray-v2:0"
    },
    {
      "Effect": "Allow",
      "Action": "bedrock:GetAsyncInvoke",
      "Resource": "arn:aws:bedrock:us-west-2:123456789012:async-invoke/*"
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
# Luma Ray 2
npx promptfoo@latest eval -c promptfooconfig.luma-ray.yaml
```

## Model Comparison

### Amazon Nova Reel (historical reference)

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

### Nova Reel (historical reference)

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
