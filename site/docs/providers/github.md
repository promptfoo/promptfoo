# Github

[Github Models](https://github.com/marketplace/models/) provides an interface for a handful of LLM APIs.

The Github provider is compatible with all the options provided by the [OpenAI provider](/docs/providers/openai/).

## Configuration

Here's an example of how to configure the provider to use the `gpt-4o-mini` model:

```yaml
providers:
  - id: github:gpt-4o-mini
    config:
      temperature: 0.5
      apiKey: YOUR_GITHUB_TOKEN
```

If you prefer to use an environment variable, set `GITHUB_TOKEN`.

### Using Embedding Models

GitHub also offers embedding models, which you can use for semantic search, clustering, or other vector-based operations. Here's how to configure an embedding model:

```yaml
providers:
  - id: github:text-embedding-3-large
    config:
      apiKey: YOUR_GITHUB_TOKEN
```

You can use any of the embedding models listed in the "Available Models" section below.

#### Example: Comparing Similarity

Here's an example of how to use GitHub embedding models to compare the similarity between different pieces of text:

```yaml
prompts:
  - "The quick brown fox jumps over the lazy dog"
  - "A fast auburn fox leaps above the sleepy canine"
  - "Completely unrelated text about programming"

providers:
  - id: github:text-embedding-3-large

tests:
  - providers: [0]
    assert:
      - type: similarity
        threshold: 0.8
        value:
          - 0  # first prompt
          - 1  # second prompt
      - type: similarity
        threshold: 0.5
        value:
          - 0  # first prompt
          - 2  # third prompt
        negate: true  # similarity should be less than 0.5
```

This configuration tests that the first two prompts are semantically similar (with similarity > 0.8), while the third prompt is not similar to the first (similarity < 0.5).

## Getting a GitHub Token

To use the GitHub Models API, you'll need a GitHub token with appropriate permissions:

### Using the GitHub Website

1. Go to your GitHub account settings -> [Developer settings](https://github.com/settings/apps)
2. Navigate to "Personal access tokens" -> "Fine-grained tokens"
3. Click "Generate new token"
4. Set appropriate permissions for the GitHub Models API
5. Copy your token and use it in your configuration or set it as the `GITHUB_TOKEN` environment variable

### Using GitHub CLI

If you have the GitHub CLI (`gh`) installed, you can also manage and generate tokens through the command line:

1. Install the GitHub CLI if you haven't already:
   ```bash
   # macOS
   brew install gh
   
   # Windows
   winget install --id GitHub.cli
   
   # Linux
   sudo apt install gh  # Debian/Ubuntu
   ```

2. Log in to GitHub (if you haven't already):
   ```bash
   gh auth login
   ```

3. Generate a new token:
   ```bash
   gh auth token
   ```
   
   This will display your current authentication token. Alternatively, you can create a new token with:
   ```bash
   gh auth refresh -h github.com -s read:packages,write:packages
   ```
   
   Make sure to specify the appropriate scopes needed for GitHub Models access.

4. Use the token in your promptfoo configuration or set it as an environment variable:
   ```bash
   export GITHUB_TOKEN=your_token_here
   ```

GitHub is recommended for accessing these models as it provides a unified interface to multiple model providers.

## Available Models

GitHub Models marketplace currently offers the following models:

### Text Generation Models
- **OpenAI**
  - OpenAI o1-preview
  - OpenAI o1
  - OpenAI o1-mini
  - OpenAI o3-mini
  - OpenAI GPT-4o
  - OpenAI GPT-4o mini

- **Microsoft**
  - Phi-3-mini instruct (4k)
  - Phi-3-mini instruct (128k)
  - Phi-3-medium instruct (4k)
  - Phi-3-medium instruct (128k)
  - Phi-3-small instruct (8k)
  - Phi-3-small instruct (128k)
  - Phi-3.5-mini instruct (128k)
  - Phi-3.5-MoE instruct (128k)
  - Phi-3.5-vision instruct (128k)
  - Phi-4
  - Phi-4-mini-instruct
  - Phi-4-multimodal-instruct

- **Meta**
  - Meta-Llama-3-8B-Instruct
  - Meta-Llama-3-70B-Instruct
  - Meta-Llama-3.1-8B-Instruct
  - Meta-Llama-3.1-70B-Instruct
  - Meta-Llama-3.1-405B-Instruct
  - Llama-3.2-11B-Vision-Instruct
  - Llama-3.2-90B-Vision-Instruct
  - Llama-3.3-70B-Instruct

- **Mistral AI**
  - Mistral Small
  - Mistral Large
  - Mistral Large (2407)
  - Mistral Large 24.11
  - Mistral Nemo
  - Ministral 3B
  - Codestral 25.01

- **Cohere**
  - Cohere Command R
  - Cohere Command R+
  - Cohere Command R 08-2024
  - Cohere Command R+ 08-2024

- **DeepSeek**
  - DeepSeek-V3
  - DeepSeek-R1

- **AI21 Labs**
  - AI21 Jamba 1.5 Mini
  - AI21 Jamba 1.5 Large

- **Core42**
  - JAIS 30b Chat

### Embedding Models
- **OpenAI**
  - OpenAI Text Embedding 3 (small)
  - OpenAI Text Embedding 3 (large)

- **Cohere**
  - Cohere Embed v3 English
  - Cohere Embed v3 Multilingual

For more information on the available models and API usage, refer to the [Github documentation](https://github.com/marketplace/models/) for each specific model.
