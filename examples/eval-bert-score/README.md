# eval-bert-score (BERTScore Evaluation)

Measure semantic similarity between model outputs and reference text with BERTScore.

```sh
npx promptfoo@latest init --example eval-bert-score
cd eval-bert-score
```

## Setup

Use Python 3.10 or newer and keep the virtual environment active when running Promptfoo:

```sh
python3 -m venv venv
source venv/bin/activate
```

BERTScore installs its own Torch and Transformers dependencies. If you only need CPU inference, install the CPU build of Torch before the requirements:

```sh
python -m pip install torch --index-url https://download.pytorch.org/whl/cpu
```

Then install the example and configure its model provider:

```sh
python -m pip install -r requirements.txt
export OPENAI_API_KEY=your-api-key
```

The first evaluation downloads the default English `roberta-large` model (about 1.4 GB). Allow enough disk space and memory. You can also set `PROMPTFOO_PYTHON` to the absolute path of `venv/bin/python` instead of keeping the environment active.

## Run the examples

```sh
npx promptfoo@latest eval --no-cache
npx promptfoo@latest eval -c promptfooconfig-advanced.yaml --no-cache
```

The assertion returns BERTScore F1 for Promptfoo to compare with the threshold. The basic example uses one reference; the advanced example scores several references together and returns the best match:

```yaml
prompts:
  - 'Explain: {{topic}}'
providers:
  - openai:gpt-4.1-nano
defaultTest:
  options:
    disableVarExpansion: true
tests:
  - vars:
      topic: gradient descent
      reference:
        - An optimization algorithm that adjusts parameters to minimize error
        - A method for finding a minimum by moving in the direction of steepest descent
    assert:
      - type: python
        value: file://bertscore_check.py
        threshold: 0.75
```

Each assertion starts a Python process and loads a scorer. Missing references and scoring errors return a failed assertion with a reason.

Calibrate thresholds against your own examples; semantic similarity does not establish factual correctness. To change models, set `vars.bertScoreModel` to a Hugging Face identifier or local directory. Models outside BERTScore's supported list also require `vars.bertScoreLayers`.

Run the offline assertion checks with:

```sh
python -m unittest discover -p '*_test.py'
```

In a repository checkout with Node dependencies and this example's Python requirements installed, run the Linux/macOS integration smoke from the repository root:

```sh
python examples/eval-bert-score/tests/smoke_cli.py
```

The smoke creates a tiny model locally and runs the real scorer through both configs with an echo provider. It checks scoring and reference handling without API credentials or model downloads. The randomly initialized model does not test semantic accuracy.

[Learn more about BERTScore](https://arxiv.org/abs/1904.09675).
