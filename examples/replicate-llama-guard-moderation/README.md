# replicate-llama-guard-moderation (LlamaGuard Content Moderation)

This example demonstrates how to use Meta's LlamaGuard models for content moderation in promptfoo.

## Features

This example shows:

- Using LlamaGuard 3 for content moderation
- Checking for specific safety categories
- Examples of content that might trigger different categories
- Placeholder for LlamaGuard 4 (when available on Replicate)

## LlamaGuard Categories

LlamaGuard monitors these safety categories:

| Code | Category               | Description                                   |
| ---- | ---------------------- | --------------------------------------------- |
| S1   | Violent Crimes         | Content enabling violent crimes               |
| S2   | Non-Violent Crimes     | Content enabling non-violent crimes           |
| S3   | Sex Crimes             | Content enabling sex-related crimes           |
| S4   | Child Exploitation     | Content depicting child abuse                 |
| S5   | Defamation             | Defamatory statements                         |
| S6   | Specialized Advice     | Dangerous financial, medical, or legal advice |
| S7   | Privacy                | Sensitive personal information                |
| S8   | Intellectual Property  | IP violations                                 |
| S9   | Indiscriminate Weapons | WMD creation                                  |
| S10  | Hate                   | Hateful content                               |
| S11  | Self-Harm              | Content enabling self-harm                    |
| S12  | Sexual Content         | Adult content                                 |
| S13  | Elections              | Election misinformation                       |
| S14  | Code Interpreter Abuse | Code exploitation (LlamaGuard 4 only)         |

## Setup

1. Get a Replicate API token from https://replicate.com/account/api-tokens
2. Set the environment variable:

   ```bash
   export REPLICATE_API_TOKEN=r8_your_token_here
   ```

3. Run the evaluation:
   ```bash
   promptfoo eval
   ```

## LlamaGuard 4

LlamaGuard 4 is a 12B parameter model that adds the S14 category for code interpreter abuse detection. It's the default moderation provider for promptfoo on Replicate.

Using LlamaGuard 4:

- It's automatically used as the default moderation provider
- You can explicitly specify it with: `replicate:moderation:meta/llama-guard-4-12b`
- The example in the configuration file demonstrates S14 category detection

For compatibility, you can still use LlamaGuard 3:

- Specify: `replicate:moderation:meta/llama-guard-3-8b:146d1220d447cdcc639bc17c5f6137416042abee6ae153a2615e6ef5749205c8`
- Provides coverage for categories S1-S13
