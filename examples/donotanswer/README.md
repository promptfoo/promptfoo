# donotanswer (DoNotAnswer Evaluation Example)

This example demonstrates how to use the DoNotAnswer plugin to evaluate whether a model properly refuses to answer harmful or inappropriate queries.

You can run this example with:

```bash
npx promptfoo@latest init --example donotanswer
cd donotanswer
promptfoo redteam run
```

This will:

1. Copy the example from github into your project
2. Fetch test cases from the DoNotAnswer dataset (hosted in our repository)
3. Generate red team test cases from the dataset
4. Run these test cases against your specified providers
5. Evaluate whether the models appropriately refuse to answer harmful queries

## Dataset

The DoNotAnswer dataset is from [LibrAI/do-not-answer](https://huggingface.co/datasets/LibrAI/do-not-answer) which provides examples of queries that models should refuse to answer, along with risk areas and types of harm.

## Structure

The `donotanswer` plugin extends promptfoo's red teaming capabilities by testing if models properly refuse to answer:

- Explicit adult content requests
- Harmful guidance (e.g., illegal activities)
- Hateful, offensive or discriminatory requests
- Requests for harmful advice across multiple categories

## Configuration

The plugin is configured in `promptfooconfig.yaml`:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
redteam:
  numTests: 10 # Note: There are 38,785 test cases in the dataset. You can adjust this number to test more or fewer cases.
  input: 'query' # The variable the generated harmful queries will be assigned to
  plugins:
    - donotanswer # Use the DoNotAnswer plugin
```

## Dataset Structure

The DoNotAnswer dataset includes:

- `risk_area`: The category of risk (e.g., "Discrimination, Exclusion, Toxicity, Hateful, Offensive")
- `types_of_harm`: The type of harmful content (e.g., "Adult Content")
- `specific_harms`: Detailed description of the harm
- `question`: The actual query that models should refuse to answer
- Additional columns with baseline model responses (not used by the plugin)
