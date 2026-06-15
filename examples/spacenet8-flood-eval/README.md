# spacenet8-flood-eval (SpaceNet 8 Multimodal Flood Evaluation)

Start with one satellite-image pair, scale the same prompt to a labeled evaluation, and then compare
two models. The example keeps data preparation separate from Promptfoo so the first config stays
small and each added layer introduces one concept.

## Dataset

[SpaceNet 8](https://spacenet.ai/sn8-challenge/) combines pre/post Maxar imagery with building and
road annotations from two 2021 public training events: flooding after heavy rain in Germany and
Hurricane Ida in Louisiana.

The Python builder reads the official SpaceNet mapping CSVs, downloads the requested source files,
and creates 640 x 640 JPEG quicklooks. The current mappings contain 801 primary pre/post pairs (202
Germany and 599 Louisiana) plus 80 Germany pairs with a second post-event image, for 881 evaluable
pairs total.

Numeric limits select primary pairs in deterministic round-robin collection order. Alternate
post-event pairs are added only after all 801 primary pairs. Generated data is gitignored.

## Level 1: One-pair smoke test

Initialize the example and build only its first image pair:

```bash
npx promptfoo@latest init --example spacenet8-flood-eval
cd spacenet8-flood-eval
python -m pip install -r requirements.txt
python scripts/build_dataset.py --limit 1
```

Set `OPENAI_API_KEY`, then run the default config:

```bash
promptfoo eval --no-cache --no-share
promptfoo view
```

`promptfooconfig.yaml` intentionally uses only Promptfoo fundamentals:

- One static chat prompt
- One OpenAI provider
- One inline test with `file://` image variables
- One built-in `is-json` assertion

Promptfoo loads the local JPEGs as data URLs, sends the paired images, validates the structured
response, and records the output, latency, tokens, and cost. There is no custom test loader or
custom grader in this level.

## Level 2: Labeled accuracy evaluation

Build the default 50-pair development sample. The cache preserves files downloaded by Level 1:

```bash
python scripts/build_dataset.py
```

This downloads approximately 360 MB, generates approximately 11 MB of quicklooks, and writes
`dataset.json` with source URLs, SHA-256 values, and hidden label counts.

`scripts/generate_tests.py` turns that manifest into Promptfoo tests when the config loads. There is
no generated test file to keep in sync.

Run the accuracy config with high concurrency:

```bash
umask 077
promptfoo eval -c promptfooconfig.accuracy.yaml \
  --no-cache --no-share -j 50 -o results/openai.json
promptfoo view
```

`promptfooconfig.accuracy.yaml` adds one advanced concept: `grader.cjs` compares model output with
the generated GeoJSON-derived labels and reports:

- `building_status_accuracy`
- `road_status_accuracy`
- `building_count_accuracy`
- `road_count_accuracy`
- `non_abstention`

## Level 3: Compare models

The comparison config runs the same prompt and tests against GPT-5.5 and GPT-5.4 Mini:

```bash
umask 077
promptfoo eval -c promptfooconfig.compare.yaml \
  --no-cache --no-share -n 5 -j 50 -o results/model-comparison.json
promptfoo view
```

Start with `-n 5` because this makes two paid model calls per pair. Remove the filter when you are
ready to compare the full generated sample. Promptfoo records each model's labeled accuracy,
latency, token use, and cost.

To compare the same models through your local Codex login, use the app-server config:

```bash
promptfoo eval -c promptfooconfig.codex-app-server.yaml \
  --no-cache --no-share -n 5 -j 50 -o results/codex-app-server.json
```

Each provider starts and reuses its own `codex app-server` process. It sends the quicklooks as image
input items and records Codex thread, turn, token, cost, and trajectory metadata. It does not attach
to the running Codex Desktop process. If `codex` on `PATH` is not the binary you want to evaluate,
set `CODEX_PATH` to the desired executable before running the command.

## Level 4: Scale the dataset

Use any positive pair count up to 881, or extract every mapped pair:

```bash
python scripts/build_dataset.py --limit 250
python scripts/build_dataset.py --limit all
```

The full build creates 881 tests and 1,762 model-input quicklooks. It downloads several gigabytes,
so use the default sample while developing prompts and reserve the full set for final comparisons.

## Level 5: Hill climb

Treat the 50 pairs as a development set and change one axis at a time:

1. Add a second prompt to compare baseline and candidate instructions on identical images.
2. Change or add a provider in `promptfooconfig.compare.yaml` to compare quality, latency, token
   use, and cost.
3. Filter or group by `geography` and `event` metadata to find where a candidate improves or
   regresses.
4. Add robustness cases such as cloud cover, image corruption, or registration offsets only after
   the labeled baseline is stable.

Do not repeatedly optimize on this sample and then claim generalization. Once prompt or model
selection begins, keep a separate event or tile set as a final holdout evaluation.

## Output contract

The model returns:

```json
{
  "building_flooded": "yes",
  "road_flooded": "no",
  "flooded_building_count_range": "1-10",
  "flooded_road_count_range": "0",
  "abstain": false
}
```

See `response-schema.json` for all allowed status and count-range values.

## Limits

This is a coarse image-level LLM evaluation, not the official SpaceNet 8 segmentation benchmark.
It does not measure polygon IoU, road-network APLS, flood depth, structural safety, routing safety,
or generalization to held-out events. The images are public training data, and the sample was
selected using labels. Treat it as a multimodal evaluation demo, not operational validation.

The SpaceNet 8 data is distributed under CC BY-SA 4.0. See `DATA_LICENSE.md` for attribution and
change notices.
