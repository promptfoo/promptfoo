# AWS Bedrock Examples

This directory contains examples of using the AWS Bedrock provider with promptfoo.

## Setup

1. Ensure you have installed the required SDK packages:

   ```sh
   npm install -g @aws-sdk/client-bedrock-runtime

   # For Knowledge Base examples
   npm install -g @aws-sdk/client-bedrock-agent-runtime
   ```

2. Configure your AWS credentials for Bedrock access

## Examples

### Claude Model

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.claude.yaml
```

### Llama Model

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.llama.yaml
```

### Mistral Model

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.mistral.yaml
```

### AI21 Models (Jamba)

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.a21.yaml
```

### Titan Text Model

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.titan-text.yaml
```

### DeepSeek Model

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.deepseek.yaml
```

### Nova Model

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.nova.yaml
```

### Nova with Tool Use

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.nova.tool.yaml
```

### Nova with Multimodal Input

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.nova.multimodal.yaml
```

### Knowledge Base (RAG)

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.knowledge-base.yaml
```

_Note: You'll need to create a Knowledge Base in AWS Bedrock and update the `knowledgeBaseId` in the config file before running this example._

## All Models Combined

```bash
promptfoo eval -c examples/amazon-bedrock/promptfooconfig.yaml
```
