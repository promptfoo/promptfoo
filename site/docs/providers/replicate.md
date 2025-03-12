# Replicate

Replicate is an API for machine learning models. It currently hosts models like [Llama v2](https://replicate.com/replicate/llama70b-v2-chat), [Gemma](https://replicate.com/google-deepmind/gemma-7b-it), and [Mistral/Mixtral](https://replicate.com/mistralai/mixtral-8x7b-instruct-v0.1).

To run a model, specify the Replicate model name and version, like so:

```
replicate:replicate/llama70b-v2-chat:e951f18578850b652510200860fc4ea62b3b16fac280f83ff32282f87bbd2e48
```

## Examples

Here's an example of using Llama on Replicate. In the case of Llama, the version hash and everything under `config` is optional:

```yaml
providers:
  - id: replicate:meta/llama-2-7b-chat
    config:
      temperature: 0.01
      max_length: 1024
      prompt:
        prefix: '[INST] '
        suffix: ' [/INST]'
```

Here's an example of using Gemma on Replicate. Note that unlike Llama, it does not have a default version, so we specify the model version:

```yaml
providers:
  - id: replicate:google-deepmind/gemma-7b-it:2790a695e5dcae15506138cc4718d1106d0d475e6dca4b1d43f42414647993d5
    config:
      temperature: 0.01
      max_new_tokens: 1024
      prompt:
        prefix: "<start_of_turn>user\n"
        suffix: "<end_of_turn>\n<start_of_turn>model"
```

## Configuration

The Replicate provider supports several [configuration options](https://github.com/promptfoo/promptfoo/blob/main/src/providers/replicate.ts#L9-L17) that can be used to customize the behavior of the models, like so:

| Parameter            | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| `temperature`        | Controls randomness in the generation process.                |
| `max_length`         | Specifies the maximum length of the generated text.           |
| `max_new_tokens`     | Limits the number of new tokens to generate.                  |
| `top_p`              | Nucleus sampling: a float between 0 and 1.                    |
| `top_k`              | Top-k sampling: number of highest probability tokens to keep. |
| `repetition_penalty` | Penalizes repetition of words in the generated text.          |
| `system_prompt`      | Sets a system-level prompt for all requests.                  |
| `stop_sequences`     | Specifies stopping sequences that halt the generation.        |
| `seed`               | Sets a seed for reproducible results.                         |

:::warning
Not every model supports every completion parameter. Be sure to review the API provided by the model beforehand.
:::

These parameters are supported for all models:

| Parameter       | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `apiKey`        | The API key for authentication with Replicate.                           |
| `prompt.prefix` | String added before each prompt. Useful for instruction/chat formatting. |
| `prompt.suffix` | String added after each prompt. Useful for instruction/chat formatting.  |

Supported environment variables:

- `REPLICATE_API_TOKEN` - Your Replicate API key.
- `REPLICATE_API_KEY` - An alternative to `REPLICATE_API_TOKEN` for your API key.
- `REPLICATE_MAX_LENGTH` - Specifies the maximum length of the generated text.
- `REPLICATE_TEMPERATURE` - Controls randomness in the generation process.
- `REPLICATE_REPETITION_PENALTY` - Penalizes repetition of words in the generated text.
- `REPLICATE_TOP_P` - Controls the nucleus sampling: a float between 0 and 1.
- `REPLICATE_TOP_K` - Controls the top-k sampling: the number of highest probability vocabulary tokens to keep for top-k-filtering.
- `REPLICATE_SEED` - Sets a seed for reproducible results.
- `REPLICATE_STOP_SEQUENCES` - Specifies stopping sequences that halt the generation.
- `REPLICATE_SYSTEM_PROMPT` - Sets a system-level prompt for all requests.

## Images

Image generators such as SDXL can be used like so:

```yaml
prompts:
  - 'Generate an image: {{subject}}'

providers:
  - id: replicate:image:stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc
    config:
      width: 768
      height: 768
      num_inference_steps: 50

tests:
  - vars:
      subject: fruit loops
```

## Supported Parameters for Images

These parameters are supported for image generation models:

| Parameter             | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `width`               | The width of the generated image.                             |
| `height`              | The height of the generated image.                            |
| `refine`              | Which refine style to use                                     |
| `apply_watermark`     | Apply a watermark to the generated image.                     |
| `num_inference_steps` | The number of inference steps to use during image generation. |

:::warning
Not every model supports every image parameter. Be sure to review the API provided by the model beforehand.
:::

Supported environment variables for images:

- `REPLICATE_API_TOKEN` - Your Replicate API key.
- `REPLICATE_API_KEY` - An alternative to `REPLICATE_API_TOKEN` for your API key.
