# IBM BAM

The `bam` provider integrates with IBM's BAM API, allowing access to various models like `meta-llama/llama-2-70b-chat` and `ibm/granite-13b-chat-v2`.

## Setup

This provider requires you to install the IBM SDK:

```sh
npm install @ibm-generative-ai/node-sdk
```

## Configuration

Configure the BAM provider by specifying the model and various generation parameters. Here is an example of how to configure the BAM provider in your configuration file:

```yaml
providers:
  - id: bam:chat:meta-llama/llama-2-70b-chat
    config:
      temperature: 0.01
      max_new_tokens: 1024
      prompt:
        prefix: '[INST] '
        suffix: '[/INST] '
  - id: bam:chat:ibm/granite-13b-chat-v2
    config:
      temperature: 0.01
      max_new_tokens: 1024
      prompt:
        prefix: '[INST] '
        suffix: '[/INST] '
```

## Authentication

To use the BAM provider, you need to set the `BAM_API_KEY` environment variable or specify the `apiKey` directly in the provider configuration. The API key can also be dynamically fetched from an environment variable specified in the `apiKeyEnvar` field in the configuration.

```sh
export BAM_API_KEY='your-bam-api-key'
```

## API Client Initialization

The BAM provider initializes an API client using the IBM Generative AI Node SDK. The endpoint for the BAM API is configured to `https://bam-api.res.ibm.com/`.

## Configuration

| Parameter               | Type       | Description                                                                                |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `top_k`                 | `number`   | Controls diversity via random sampling: lower values make sampling more deterministic.     |
| `top_p`                 | `number`   | Nucleus sampling: higher values cause the model to consider more candidates.               |
| `typical_p`             | `number`   | Controls the "typicality" during sampling, balancing between `top_k` and `top_p`.          |
| `beam_width`            | `number`   | Sets the beam width for beam search decoding, controlling the breadth of the search.       |
| `time_limit`            | `number`   | Maximum time in milliseconds the model should take to generate a response.                 |
| `random_seed`           | `number`   | Seed for random number generator, ensuring reproducibility of the output.                  |
| `temperature`           | `number`   | Controls randomness. Lower values make the model more deterministic.                       |
| `length_penalty`        | `object`   | Adjusts the length of the generated output. Includes `start_index` and `decay_factor`.     |
| `max_new_tokens`        | `number`   | Maximum number of new tokens to generate.                                                  |
| `min_new_tokens`        | `number`   | Minimum number of new tokens to generate.                                                  |
| `return_options`        | `object`   | Options for additional information to return with the output, such as token probabilities. |
| `stop_sequences`        | `string[]` | Array of strings that, if generated, will stop the generation.                             |
| `decoding_method`       | `string`   | Specifies the decoding method, e.g., 'greedy' or 'sample'.                                 |
| `repetition_penalty`    | `number`   | Penalty applied to discourage repetition in the output.                                    |
| `include_stop_sequence` | `boolean`  | Whether to include stop sequences in the output.                                           |
| `truncate_input_tokens` | `number`   | Maximum number of tokens to consider from the input text.                                  |

### Moderation Parameters

Moderation settings can also be specified to manage content safety and compliance:

| Parameter       | Type     | Description                                                                                |
| --------------- | -------- | ------------------------------------------------------------------------------------------ |
| `hap`           | `object` | Settings for handling hate speech. Can be enabled/disabled and configured with thresholds. |
| `stigma`        | `object` | Settings for handling stigmatizing content. Includes similar configurations as `hap`.      |
| `implicit_hate` | `object` | Settings for managing implicitly hateful content.                                          |

Each moderation parameter can include the following sub-parameters: `input`, `output`, `threshold`, and `send_tokens` to customize the moderation behavior.

Here's an example:

```yaml
providers:
  - id: bam:chat:ibm/granite-13b-chat-v2
    config:
      moderations:
        hap:
          input: true
          output: true
          threshold: 0.9
```
