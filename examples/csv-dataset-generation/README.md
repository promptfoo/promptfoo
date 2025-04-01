# CSV Dataset Generation

An example of [dataset generation](/docs/configuration/datasets) using CSVs for [prompt definition](/docs/configuration/parameters/#prompts-as-csv) and [test loading](/docs/configuration/guide/#loading-tests-from-csv).

You can run this example with:

```bash
npx promptfoo@latest init --example csv-dataset-generation
```

## Overview

This example demonstrates how to:

1. Define prompts in a CSV file
2. Generate a dataset of test cases
3. Use the generated dataset for evaluations

The workflow consists of two main steps:

1. Generating a travel guide dataset using template prompts
2. Evaluating the generated dataset with different providers

## Files

- `travel-guide-prompts.csv` - Contains prompt templates for travel guide responses
- `generate.yaml` - Configuration for dataset generation
- `eval.yaml` - Configuration for evaluating the generated dataset
- `travel-dataset.csv` - The output dataset (generated)

## Generating a dataset

Run the following command to generate a dataset of travel guide prompts for different locations:

```sh
promptfoo generate dataset \
    -c examples/csv-dataset-generation/generate.yaml \
    -o examples/csv-dataset-generation/travel-dataset.csv
```

This will create `travel-dataset.csv` containing test cases for various locations like San Francisco, Wyoming, Kyoto, and the Great Barrier Reef.

## Evaluating the generated dataset

After generating the dataset, you can evaluate it using different providers:

```sh
promptfoo eval -c examples/csv-dataset-generation/eval.yaml
```

This will run the travel guide prompts against the specified provider(s) using the test cases from the generated dataset.

## Configuration Details

### generate.yaml

- Uses prompts from `travel-guide-prompts.csv`
- Generates test cases for multiple locations
- Uses the `echo` provider for demonstration

### eval.yaml

- Uses the same prompts from `travel-guide-prompts.csv`
- Loads test cases from the generated `travel-dataset.csv`
- Can be configured with different providers for actual evaluations

## Expected Output

The generated dataset will contain variations of travel guide prompts for different locations, which can then be evaluated against different language models or providers to compare their responses.
