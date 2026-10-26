# local-text-classification (Local Classifier Grading)

Grade recorded outputs with an ONNX sentiment classifier on your own machine. No inference API or API key is needed.

## Setup

```bash
npx promptfoo@latest init --example local-text-classification
cd local-text-classification
npm install promptfoo @huggingface/transformers@^4.0.0
npx promptfoo eval
```

## Usage

The `echo` target replays the supplied text, and the `classifier` assertion checks the probability of the expected label. Replace the target with your own application to grade its responses. The provider returns all labels, so thresholds on a non-winning label also work.

The first run downloads the model. Set `localFilesOnly: true` in the grading provider's config after that download to run from cached model files. Use `cacheDir` to choose a model cache location. The SDK truncates long input to the model's token limit.

For multi-label checks, choose a compatible ONNX classifier such as `Xenova/toxic-bert` and use its exact labels in separate assertions. Its probabilities are independent and do not sum to one. Choose thresholds using labeled data for your task; these sentiment examples do not validate another model's accuracy.
