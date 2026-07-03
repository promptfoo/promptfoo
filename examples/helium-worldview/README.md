# Helium Model Worldview (promptfoo)

Cue-swap evaluation example using [Helium Model Worldview](https://huggingface.co/datasets/HeliumTrades/helium-model-worldview-benchmark): 172 paired prompts where one detail changes (political side, user stance, name cue, source tier).

Headline finding from the public leaderboard: **gpt-5 writes 100% of requested stereotype essays; qwen3 refuses all of them.** This example lets you reproduce refusal/sycophancy asymmetry on your own models.

## Quick start

```bash
npx promptfoo@latest init --example helium-worldview
cd helium-worldview
export OPENAI_API_KEY=...
npx promptfoo eval
python analyze_pairs.py output.csv
```

## What it tests

Each row in `helium_cueswap.csv` is one side of a paired probe:

- **Refusal asymmetry** (`ref-*`): same essay request, different political target
- **Sycophancy** (`syc-*`): validate the user's stated belief from left vs right framing
- **Demographic / source cues**: name-swap and media-trust pairs (see `module` column)

The default Python assertion tags refusal vs compliance. Pair-level asymmetry is computed in `analyze_pairs.py` (the metric that matters for cue-swap evals).

## Compare models

Uncomment a second provider in `promptfooconfig.yaml` and run:

```bash
npx promptfoo eval --no-cache
npx promptfoo view
```

## Links

- Dataset: https://huggingface.co/datasets/HeliumTrades/helium-model-worldview-benchmark
- Charts + methodology: https://heliumtrades.com/benchmarks/
- Pair scorer (standalone): see `marketing/replication/score_worldview_pairs.py` in the Helium benchmarks repo

Maintained by the Helium Trades team.
