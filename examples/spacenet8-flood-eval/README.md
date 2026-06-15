# spacenet8-flood-eval (SpaceNet 8 Multimodal Flood Evaluation)

Evaluate a vision model on 50 labeled pre/post satellite-image pairs from the public SpaceNet 8
training set. The model returns structured JSON; Promptfoo measures flood-status and count-range
accuracy against hidden GeoJSON-derived labels while tracking latency, tokens, and cost.

## What this demonstrates

- Paired image inputs in an OpenAI chat prompt
- Strict JSON-schema output
- A custom JavaScript grader with named accuracy metrics
- Images rendered directly in the Promptfoo results table
- A reproducible public dataset download with source hashes

## Dataset

[SpaceNet 8](https://spacenet.ai/sn8-challenge/) combines pre/post Maxar imagery with building and
road annotations from two 2021 public training events: flooding after heavy rain in Germany and
Hurricane Ida in Louisiana.

This example freezes a stratified sample of 50 independent tiles, or 100 images. It includes dry,
low-, medium-, and high-flood label ranges from both geographies. The sample is intentionally
balanced for evaluation coverage, so it is not a prevalence-weighted estimate of the full dataset.

For each tile, the model sees only:

- A 640 x 640 pre-event image
- A 640 x 640 post-event image

The grader privately reads official GeoJSON-derived building and road flood counts from
`dataset.json`. Flood labels are never rendered into the prompt.

## Setup

```bash
npx promptfoo@latest init --example spacenet8-flood-eval
cd spacenet8-flood-eval
python -m pip install -r requirements.txt
python scripts/build_dataset.py
```

The build downloads approximately 360 MB of selected source GeoTIFFs and labels, verifies every
SHA-256, recomputes the hidden counts, and generates approximately 11 MB of JPEG quicklooks.
Downloaded and generated images are gitignored.

Set `OPENAI_API_KEY`, then run:

```bash
umask 077
promptfoo eval --no-cache --no-share -j 50 -o results/openai.json
promptfoo view
```

Promptfoo reports the labeled metrics below alongside latency, token usage, and provider cost. If
your provider rate limits do not support 50 concurrent requests, reduce `-j 50`.

## Output contract

The model returns:

```json
{
  "building_flooded": "yes | no | unknown",
  "road_flooded": "yes | no | unknown",
  "flooded_building_count_range": "0 | 1-10 | 11-20 | 21-50 | 51-100 | >100 | unknown",
  "flooded_road_count_range": "0 | 1-10 | 11-20 | 21-50 | 51-100 | >100 | unknown",
  "abstain": false
}
```

Promptfoo reports these named metrics:

- `building_status_accuracy`
- `road_status_accuracy`
- `building_count_accuracy`
- `road_count_accuracy`
- `non_abstention`

## Limits

This is a coarse image-level LLM evaluation, not the official SpaceNet 8 segmentation benchmark.
It does not measure polygon IoU, road-network APLS, flood depth, structural safety, routing safety,
or generalization to held-out events. The images are public training data, and the sample was
selected using labels. Treat it as a multimodal evaluation demo, not operational validation.

The SpaceNet 8 data is distributed under CC BY-SA 4.0. See `DATA_LICENSE.md` for attribution and
change notices.
