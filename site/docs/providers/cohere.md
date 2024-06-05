# Cohere

The `cohere` provider is an interface to Cohere AI's [chat inference API](https://docs.cohere.com/reference/chat), with models such as Command R that are optimized for RAG and tool usage.

## Setup

First, set the `COHERE_API_KEY` environment variable with your Cohere API key.

Next, edit the promptfoo configuration file to point to the Cohere provider.

- `cohere:<model name>` - uses the specified Cohere model (e.g., `command`, `command-light`).

The following models are confirmed supported. For an up-to-date list of supported models, see [Cohere Models](https://docs.cohere.com/docs/models).

- command-light
- command-light-nightly
- command
- command-nightly
- command-r
- command-r-plus

Here's an example configuration:

```yaml
providers:
  - id: cohere:command
    config:
      temperature: 0.5
      max_tokens: 256
      prompt_truncation: 'AUTO'
      connectors:
        - id: web-search
```

## Control over prompting

By default, a regular string prompt will be automatically wrapped in the appropriate chat format and sent to the Cohere API via the `message` field:

```yaml
prompts:
  - 'Write a tweet about {{topic}}'

providers:
  - cohere:command

tests:
  - vars:
      topic: bananas
```

If desired, your prompt can reference a YAML or JSON file that has a more complex set of API parameters. For example:

```yaml
prompts:
  - file://prompt1.yaml

providers:
  - cohere:command

tests:
  - vars:
      question: What year was he born?
  - vars:
      question: What did he like eating for breakfast?
```

And in `prompt1.yaml`:

```yaml
chat_history:
  - role: USER
    message: 'Who discovered gravity?'
  - role: CHATBOT
    message: 'Isaac Newton'
message: '{{question}}'
connectors:
  - id: web-search
```

## Displaying searches and documents

When the Cohere API is called, the provider can optionally include the search queries and documents in the output. This is controlled by the `showSearchQueries` and `showDocuments` config parameters. If true, the content will be appending to the output.

## Configuration

Cohere parameters

| Parameter             | Description                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `apiKey`              | Your Cohere API key if not using an environment variable.                                          |
| `chatHistory`         | An array of chat history objects with role, message, and optionally user_name and conversation_id. |
| `connectors`          | An array of connector objects for integrating with external systems.                               |
| `documents`           | An array of document objects for providing reference material to the model.                        |
| `frequency_penalty`   | Penalizes new tokens based on their frequency in the text so far.                                  |
| `k`                   | Controls the diversity of the output via top-k sampling.                                           |
| `max_tokens`          | The maximum length of the generated text.                                                          |
| `modelName`           | The model name to use for the chat completion.                                                     |
| `p`                   | Controls the diversity of the output via nucleus (top-p) sampling.                                 |
| `preamble_override`   | A string to override the default preamble used by the model.                                       |
| `presence_penalty`    | Penalizes new tokens based on their presence in the text so far.                                   |
| `prompt_truncation`   | Controls how prompts are truncated ('AUTO' or 'OFF').                                              |
| `search_queries_only` | If true, only search queries are processed.                                                        |
| `temperature`         | Controls the randomness of the output.                                                             |

Special parameters

| Parameter           | Description                                              |
| ------------------- | -------------------------------------------------------- |
| `showSearchQueries` | If true, includes the search queries used in the output. |
| `showDocuments`     | If true, includes the documents used in the output.      |
