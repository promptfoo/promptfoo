# spacenet8-flood-eval (SpaceNet 8 Multimodal Flood Evaluation)

Start with one satellite-image pair and a built-in assertion, then scale the same prompt to a
50-pair labeled accuracy evaluation. The example keeps data preparation separate from Promptfoo so
the first config stays small and each added layer has a clear purpose.

## Dataset

[SpaceNet 8](https://spacenet.ai/sn8-challenge/) combines pre/post Maxar imagery with building and
road annotations from two 2021 public training events: flooding after heavy rain in Germany and
Hurricane Ida in Louisiana.

The Python builder owns a fixed, stratified sample of 50 tiles. It resolves image filenames through
the official SpaceNet mapping CSVs, downloads the source files, creates 640 x 640 JPEG quicklooks,
and generates the local labels and test cases used by Promptfoo. Generated files are gitignored.

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

Build all 50 pairs. The cache preserves files downloaded by Level 1:

```bash
python scripts/build_dataset.py
```

This downloads approximately 360 MB, generates approximately 11 MB of quicklooks, and writes:

- `dataset.json`: source URLs, SHA-256 values, and hidden label counts
- `tests.generated.json`: 50 Promptfoo tests with local image references

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

## Level 3: Hill climb

Treat the 50 pairs as a development set and change one axis at a time:

1. Add a second prompt to compare baseline and candidate instructions on identical images.
2. Add another vision provider to compare quality, latency, token use, and cost.
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
