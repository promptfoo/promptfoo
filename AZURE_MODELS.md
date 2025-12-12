# Azure AI / Microsoft Foundry - Complete Model Catalog

> Generated: 2025-11-26 via Azure CLI (`az cognitiveservices model list`)

## Summary

- **Total Unique Models**: 202
- **Providers**: 12 (OpenAI, Anthropic, Meta, DeepSeek, xAI, Microsoft, Mistral, Cohere, AI21 Labs, Black Forest Labs, Core42, OpenAI-OSS)
- **Primary Regions**: East US 2, Sweden Central (most complete availability)

---

## 1. OpenAI Models

### GPT-5 Series (Latest Flagship)

| Model       | Version    | Context | Max Output | Training Data |
| ----------- | ---------- | ------- | ---------- | ------------- |
| gpt-5       | 2025-08-07 | 400K    | 128K       | Sep 2024      |
| gpt-5-pro   | 2025-10-06 | 400K    | 128K       | Sep 2024      |
| gpt-5-mini  | 2025-08-07 | 400K    | 128K       | May 2024      |
| gpt-5-nano  | 2025-08-07 | 400K    | 128K       | May 2024      |
| gpt-5-chat  | 2025-10-03 | 128K    | 16K        | Sep 2024      |
| gpt-5-codex | 2025-09-15 | 400K    | 128K       | -             |

### GPT-5.1 Series (Newest)

| Model              | Version    | Context | Max Output | Training Data |
| ------------------ | ---------- | ------- | ---------- | ------------- |
| gpt-5.1            | 2025-11-13 | 400K    | 128K       | Sep 2024      |
| gpt-5.1-chat       | 2025-11-13 | 128K    | 16K        | Sep 2024      |
| gpt-5.1-codex      | 2025-11-13 | 400K    | 128K       | Sep 2024      |
| gpt-5.1-codex-mini | 2025-11-13 | 400K    | 128K       | Sep 2024      |

### GPT-4.1 Series (1M Context)

| Model        | Version    | Context | Max Output | Training Data |
| ------------ | ---------- | ------- | ---------- | ------------- |
| gpt-4.1      | 2025-04-14 | 1.04M   | 32.8K      | May 2024      |
| gpt-4.1-mini | 2025-04-14 | 1.04M   | 32.8K      | May 2024      |
| gpt-4.1-nano | 2025-04-14 | 1.04M   | 32.8K      | May 2024      |

### GPT-4o Series

| Model       | Version    | Context | Max Output |
| ----------- | ---------- | ------- | ---------- |
| gpt-4o      | 2024-11-20 | 128K    | 16K        |
| gpt-4o      | 2024-08-06 | 128K    | 16K        |
| gpt-4o      | 2024-05-13 | 128K    | 4K         |
| gpt-4o-mini | 2024-07-18 | 128K    | 16K        |

### Reasoning Models (o-series)

| Model            | Version    | Context | Max Output | Capabilities                |
| ---------------- | ---------- | ------- | ---------- | --------------------------- |
| o4-mini          | 2025-04-16 | 200K    | 100K       | Chat, Responses, Fine-tune  |
| o3               | 2025-04-16 | 200K    | 100K       | Chat, Responses             |
| o3-pro           | 2025-06-10 | 200K    | 100K       | Responses                   |
| o3-mini          | 2025-01-31 | 200K    | 100K       | Chat, Responses, Assistants |
| o3-deep-research | 2025-06-26 | -       | -          | Agent Service only          |
| o1               | 2024-12-17 | 200K    | 100K       | Chat, Responses, Assistants |
| o1-mini          | 2024-09-12 | 128K    | 65K        | Chat                        |

### GPT-4 Legacy

| Model     | Version          | Context |
| --------- | ---------------- | ------- |
| gpt-4     | turbo-2024-04-09 | 128K    |
| gpt-4     | 0125-Preview     | 128K    |
| gpt-4     | 1106-Preview     | 128K    |
| gpt-4     | vision-preview   | 128K    |
| gpt-4     | 0613             | 8K      |
| gpt-4-32k | 0613             | 32K     |

### GPT-3.5 Legacy

| Model                 | Version | Context |
| --------------------- | ------- | ------- |
| gpt-35-turbo          | 0125    | 16K     |
| gpt-35-turbo          | 1106    | 16K     |
| gpt-35-turbo          | 0613    | 4K      |
| gpt-35-turbo          | 0301    | 4K      |
| gpt-35-turbo-16k      | 0613    | 16K     |
| gpt-35-turbo-instruct | 0914    | 4K      |

### Audio & Realtime Models

| Model                        | Version    | Type                         |
| ---------------------------- | ---------- | ---------------------------- |
| gpt-realtime                 | 2025-08-28 | Voice AI                     |
| gpt-realtime-mini            | 2025-10-06 | Voice AI                     |
| gpt-audio                    | 2025-08-28 | Audio generation             |
| gpt-audio-mini               | 2025-10-06 | Audio generation             |
| gpt-4o-realtime-preview      | 2025-06-03 | Voice AI                     |
| gpt-4o-realtime-preview      | 2024-12-17 | Voice AI                     |
| gpt-4o-mini-realtime-preview | 2024-12-17 | Voice AI                     |
| gpt-4o-audio-preview         | 2024-12-17 | Audio                        |
| gpt-4o-mini-audio-preview    | 2024-12-17 | Audio                        |
| gpt-4o-transcribe            | 2025-03-20 | Speech-to-text               |
| gpt-4o-mini-transcribe       | 2025-03-20 | Speech-to-text               |
| gpt-4o-transcribe-diarize    | 2025-10-15 | Speech-to-text + diarization |
| gpt-4o-mini-tts              | 2025-03-20 | Text-to-speech               |
| whisper                      | 001        | Speech-to-text               |
| tts                          | 001        | Text-to-speech               |
| tts-hd                       | 001        | Text-to-speech HD            |

### Image & Video Generation

| Model            | Version    | Type             |
| ---------------- | ---------- | ---------------- |
| gpt-image-1      | 2025-04-15 | Image generation |
| gpt-image-1-mini | 2025-10-06 | Image generation |
| dall-e-3         | 3.0        | Image generation |
| dall-e-2         | 2.0        | Image generation |
| sora             | 2025-05-02 | Video generation |
| sora-2           | 2025-10-06 | Video generation |

### Embedding Models

| Model                  | Version | Max Tokens | Dimensions |
| ---------------------- | ------- | ---------- | ---------- |
| text-embedding-3-large | 1       | 8,192      | 3,072      |
| text-embedding-3-small | 1       | 8,192      | 1,536      |
| text-embedding-ada-002 | 2       | 8,192      | 1,536      |
| text-embedding-ada-002 | 1       | 2,046      | 1,536      |

### Utility & Legacy Base Models

| Model                      | Version    | Type           |
| -------------------------- | ---------- | -------------- |
| model-router               | 2025-11-18 | Routing        |
| model-router               | 2025-08-07 | Routing        |
| model-router               | 2025-05-19 | Routing        |
| codex-mini                 | 2025-05-16 | Code           |
| davinci                    | 1          | Base           |
| davinci-002                | 1          | Base           |
| curie                      | 1          | Base           |
| babbage                    | 1          | Base           |
| babbage-002                | 1          | Base           |
| ada                        | 1          | Base           |
| text-davinci-002           | 1          | Instruct       |
| text-davinci-003           | 1          | Instruct       |
| text-curie-001             | 1          | Instruct       |
| text-babbage-001           | 1          | Instruct       |
| text-ada-001               | 1          | Instruct       |
| text-similarity-ada-001    | 1          | Similarity     |
| text-similarity-curie-001  | 1          | Similarity     |
| code-davinci-002           | 1          | Code           |
| code-cushman-fine-tune-002 | 1          | Code fine-tune |
| code-davinci-fine-tune-002 | 1          | Code fine-tune |
| text-davinci-fine-tune-002 | 1          | Fine-tune      |

### OpenAI-OSS

| Model        | Version | Type                |
| ------------ | ------- | ------------------- |
| gpt-oss-120b | 1       | Open source variant |

---

## 2. Anthropic Claude Models

| Model                 | Version  | Capabilities | Regions                   | Pricing (1M tokens) |
| --------------------- | -------- | ------------ | ------------------------- | ------------------- |
| **claude-opus-4-5**   | 20251101 | Chat, Agents | East US 2, Sweden Central | $5 in / $25 out     |
| **claude-opus-4-1**   | 20250805 | Chat, Agents | East US 2, Sweden Central | -                   |
| **claude-sonnet-4-5** | 20250929 | Chat, Agents | East US 2, Sweden Central | -                   |
| **claude-haiku-4-5**  | 20251001 | Chat, Agents | East US 2, Sweden Central | -                   |

---

## 3. Meta Llama Models

### Llama 4 (Latest)

| Model                                  | Version |
| -------------------------------------- | ------- |
| Llama-4-Maverick-17B-128E-Instruct-FP8 | 1       |
| Llama-4-Scout-17B-16E-Instruct         | 1       |

### Llama 3.3

| Model                  | Versions      |
| ---------------------- | ------------- |
| Llama-3.3-70B-Instruct | 1, 2, 3, 4, 5 |

### Llama 3.2 (Vision)

| Model                         | Versions |
| ----------------------------- | -------- |
| Llama-3.2-90B-Vision-Instruct | 1, 2, 3  |
| Llama-3.2-11B-Vision-Instruct | 1, 2     |

### Llama 3.1

| Model                        | Versions      |
| ---------------------------- | ------------- |
| Meta-Llama-3.1-405B-Instruct | 1             |
| Meta-Llama-3.1-70B-Instruct  | 1, 2, 3, 4    |
| Meta-Llama-3.1-8B-Instruct   | 1, 2, 3, 4, 5 |

### Llama 3

| Model                     | Versions   |
| ------------------------- | ---------- |
| Meta-Llama-3-70B-Instruct | 6, 7, 8, 9 |
| Meta-Llama-3-8B-Instruct  | 6, 7, 8, 9 |

---

## 4. DeepSeek Models

| Model            | Version | Type      |
| ---------------- | ------- | --------- |
| DeepSeek-V3.1    | 1       | General   |
| DeepSeek-V3      | 1       | General   |
| DeepSeek-V3-0324 | 1       | General   |
| DeepSeek-R1      | 1       | Reasoning |
| DeepSeek-R1-0528 | 1       | Reasoning |

---

## 5. xAI Grok Models

| Model                     | Version | Type               |
| ------------------------- | ------- | ------------------ |
| grok-4                    | 1       | Flagship           |
| grok-4-fast-reasoning     | 1       | Fast reasoning     |
| grok-4-fast-non-reasoning | 1       | Fast non-reasoning |
| grok-3                    | 1       | Previous gen       |
| grok-3-mini               | 1       | Smaller variant    |
| grok-code-fast-1          | 1       | Code specialized   |

---

## 6. Microsoft Phi Models

### Phi-4 (Latest)

| Model                     | Versions         | Type              |
| ------------------------- | ---------------- | ----------------- |
| Phi-4                     | 2, 3, 4, 5, 6, 7 | General           |
| Phi-4-reasoning           | 1                | Reasoning         |
| Phi-4-mini-reasoning      | 1                | Reasoning (small) |
| Phi-4-mini-instruct       | 1                | Instruct          |
| Phi-4-multimodal-instruct | 1                | Vision            |

### Phi-3.5

| Model                   | Versions      | Type               |
| ----------------------- | ------------- | ------------------ |
| Phi-3.5-MoE-instruct    | 2, 3, 4, 5    | Mixture of Experts |
| Phi-3.5-mini-instruct   | 1, 2, 3, 4, 6 | Mini               |
| Phi-3.5-vision-instruct | 1, 2          | Vision             |

### Phi-3

| Model                      | Versions           | Context |
| -------------------------- | ------------------ | ------- |
| Phi-3-medium-128k-instruct | 3, 4, 5, 6, 7      | 128K    |
| Phi-3-medium-4k-instruct   | 3, 4, 5, 6         | 4K      |
| Phi-3-small-128k-instruct  | 3, 4, 5            | 128K    |
| Phi-3-small-8k-instruct    | 3, 4, 5            | 8K      |
| Phi-3-mini-128k-instruct   | 10, 11, 12, 13     | 128K    |
| Phi-3-mini-4k-instruct     | 10, 11, 13, 14, 15 | 4K      |

### Microsoft AI

| Model     | Version | Type             |
| --------- | ------- | ---------------- |
| MAI-DS-R1 | 1       | DeepSeek variant |

---

## 7. Mistral AI Models

| Model                    | Version | Type              |
| ------------------------ | ------- | ----------------- |
| Mistral-Large-2411       | 2       | Flagship          |
| Mistral-large-2407       | 1       | Previous flagship |
| Mistral-large            | 1       | Legacy            |
| mistral-medium-2505      | 1       | Medium            |
| mistral-small-2503       | 1       | Small             |
| Mistral-small            | 1       | Small legacy      |
| Mistral-Nemo             | 1       | Efficient         |
| Ministral-3B             | 1       | Tiny              |
| Codestral-2501           | 2       | Code              |
| mistral-document-ai-2505 | 1       | Document analysis |

---

## 8. Cohere Models

| Model                         | Version | Type          |
| ----------------------------- | ------- | ------------- |
| cohere-command-a              | 1       | Chat (latest) |
| Cohere-command-r-plus-08-2024 | 1       | Chat          |
| Cohere-command-r-plus         | 1       | Chat          |
| Cohere-command-r-08-2024      | 1       | Chat          |
| Cohere-command-r              | 1       | Chat          |
| embed-v-4-0                   | 1       | Embeddings    |
| Cohere-embed-v3-multilingual  | 1       | Embeddings    |
| Cohere-embed-v3-english       | 1       | Embeddings    |

---

## 9. AI21 Labs Models

| Model                | Version | Type     |
| -------------------- | ------- | -------- |
| AI21-Jamba-1.5-Large | 1       | General  |
| AI21-Jamba-1.5-Mini  | 1       | Mini     |
| AI21-Jamba-Instruct  | 1       | Instruct |

---

## 10. Black Forest Labs Models

| Model              | Version | Type                     |
| ------------------ | ------- | ------------------------ |
| FLUX-1.1-pro       | 1       | Image generation         |
| FLUX.1-Kontext-pro | 1       | In-context image editing |

---

## 11. Core42 Models

| Model         | Versions | Type                     |
| ------------- | -------- | ------------------------ |
| jais-30b-chat | 1, 2, 3  | Arabic/English bilingual |

---

## Regional Availability Summary

| Region           | Claude   | OpenAI  | Third-Party |
| ---------------- | -------- | ------- | ----------- |
| East US 2        | 4 models | Full    | Full        |
| Sweden Central   | 4 models | Full    | Full        |
| East US          | None     | Full    | Full        |
| West US          | None     | Partial | Partial     |
| West US 3        | None     | Partial | Partial     |
| West Europe      | None     | Partial | Partial     |
| North Central US | None     | Partial | Partial     |

---

## CLI Quick Reference

```bash
# List all models in a region
az cognitiveservices model list -l eastus2 -o table

# Filter by provider
az cognitiveservices model list -l eastus2 \
  --query "[?model.format=='Anthropic']" -o table

# Search by name pattern
az cognitiveservices model list -l eastus2 \
  --query "[?contains(model.name, 'gpt-5')]" -o table

# Get model details with capabilities
az cognitiveservices model list -l eastus2 -o json | \
  jq '.[] | select(.model.name=="claude-opus-4-5")'
```
