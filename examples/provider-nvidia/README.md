# provider-nvidia (NVIDIA NIM)

You can run this example with:

```bash
npx promptfoo@latest init --example provider-nvidia
cd provider-nvidia
```

## Usage

Set your `NVIDIA_API_KEY` environment variable. You can get a key from [build.nvidia.com](https://build.nvidia.com) — sign in, open any model card, and click **Get API Key**.

Then run:

```bash
promptfoo eval
```

View the results with `promptfoo view`.

## What this example does

Compares three models hosted on NVIDIA NIM (Llama 3.3 70B, Nemotron 70B, Qwen 2.5 Coder 32B) on a short summarisation task with deterministic `icontains` and `icontains-any` assertions, so the example runs end-to-end with only `NVIDIA_API_KEY` set.

See [docs/providers/nvidia.md](../../site/docs/providers/nvidia.md) for the full provider reference.
