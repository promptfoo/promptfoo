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

The assertion returns BERTScore F1, and Promptfoo compares it with the configured threshold. The basic example uses one reference string; the advanced example compares against several valid references in one scoring call and uses the best match:

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

Each Python assertion runs in a separate process and loads its own scorer. The advanced example scores its references together in one call. Missing references and model/scoring failures produce failed assertions with an explanatory reason, rather than silently reporting a low similarity score.

Scores depend on the model and task, so calibrate thresholds against your own examples. A high similarity score is not a factual-correctness check. To use a different model, set `vars.bertScoreModel` to its Hugging Face identifier or local directory. For models outside BERTScore's supported-model list, also set `vars.bertScoreLayers` to the number of layers to use; thresholds may need recalibration.

Run the offline assertion checks with:

```sh
python -m unittest discover -p '*_test.py'
```

[Learn more about BERTScore](https://arxiv.org/abs/1904.09675).
