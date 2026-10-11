# huggingface/pii (Huggingface Pii)

You can run this example with:

```bash
npx promptfoo@latest init --example huggingface/pii
cd huggingface/pii
```

## Usage

The [bigcode/starpii model](https://huggingface.co/bigcode/starpii) was trained to detect PII in source code; validate its suitability for the prose outputs in this example. Its card currently lists no Inference Provider deployment. Obtain access to the gated model and deploy a compatible token-classification endpoint, such as a [Hugging Face Inference Endpoint](https://huggingface.co/docs/inference-endpoints/guides/create_endpoint). The endpoint must return the model's entity labels and scores.

Set `HF_STARPII_ENDPOINT` to your deployment URL and `HF_TOKEN` (or `HF_API_TOKEN`) to a token authorized to access it. Set `OPENAI_API_KEY` for the LLM being tested.

Next, edit `promptfooconfig.yaml` as needed. Keep the classifier model and its PII labels consistent with the deployed endpoint; changing models requires recalibrating the assertion threshold.

Then run:

```bash
promptfoo eval
```

Afterwards, you can view the results by running `promptfoo view`
