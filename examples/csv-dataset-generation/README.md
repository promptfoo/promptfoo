# CSV Dataset Generation

An example of [dataset generation](/docs/configuration/datasets) using CSVs for [prompt definition](/docs/configuration/parameters/#prompts-as-csv) and [test loading](/docs/configuration/guide/#loading-tests-from-csv).

## Generating a dataset

```sh
promptfoo generate dataset
    -c examples/csv-dataset-generation/generate.yaml
    -o examples/csv-dataset-generation/travel-dataset.csv
```

The generated dataset, `travel-dataset.csv`, can now be used as the input to a downstream evaluation.

## Evaluating the generated dataset

```sh
promptfoo eval -c examples/csv-dataset-generation/eval.yaml
```
