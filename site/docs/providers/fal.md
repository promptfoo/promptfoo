# fal.ai

The [fal.ai] inference API is integrated into promptfoo as a provider using the [fal-js](https://github.com/fal-ai/fal-js) client, providing a native experience for using fal.ai models in your evaluations.

To run a model, specify the model type and model name: `fal:<model_type>:<model_name>`.

Supported models include

- `fal:image:fal-ai/fast-sdxl`
- `fal:image:fal-ai/flux/dev`
- `fal:image:fal-ai/flux/schnell`

Browse our [model gallery](https://fal.ai/models) for a list of available models.

## Setup

To use fal, you need to set up your API key:

1. Install the fal client as a dependency:
   ```sh
   npm install -g @fal-ai/serverless-client
   ```
2. Create am API key in the [fal dashboard](https://fal.ai/dashboard/keys).
3. Set the `FAL_KEY` environment variable:
   ```sh
   export FAL_KEY=your_api_key_here
   ```

Alternatively, you can specify the `apiKey` in the provider configuration (see below).

## Configuration

Configure the fal image provider in your promptfoo configuration file. Here's an example using [`fal-ai/flux/schnell`](https://fal.ai/models/fal-ai/flux/schnell):

```yaml
providers:
  - id: fal:image:fal-ai/flux/schnell
    config:
      image_size:
        width: 1024
        height: 1024
      num_inference_steps: 8
      seed: 6252023
```

### Key configuration options:

| Parameter | Description                              |
| --------- | ---------------------------------------- |
| `apiKey`  | The API key for authentication with fal. |

### Common image generation parameters:

| Parameter             | Type   | Description                           |
| --------------------- | ------ | ------------------------------------- |
| `image_size.width`    | number | The width of the generated image.     |
| `image_size.height`   | number | The height of the generated image.    |
| `num_inference_steps` | number | The number of inference steps to run. |
| `seed`                | number | Sets a seed for reproducible results. |

:::warning
Not every model supports every parameter. Check the API docs of each model for more details.
:::
