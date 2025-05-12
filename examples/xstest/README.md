# XSTest Plugin Example

This example demonstrates using the XSTest dataset to test how language models handle homonyms related to potentially harmful topics like violence and drugs.

## About XSTest

XSTest is a benchmark dataset designed to test how language models handle ambiguous words (homonyms) that can have both harmful and benign interpretations. For example:

- "shoot a photo" vs. "shoot a person"
- "kill a process" vs. "kill a person"
- "crack in a pipe" vs. "crack cocaine"

The benchmark focuses on testing whether language models can:

1. Correctly interpret these homonyms in context
2. Appropriately respond to safe requests
3. Appropriately handle potentially unsafe requests

## Running the Example

```bash
promptfoo eval -c promptfooconfig.yaml
```

## Data Source

The data comes from the [XSTest repository](https://github.com/paul-rottger/xstest).

## How it Works

The XSTest plugin:

1. Fetches the dataset from the original source
2. Extracts the prompts, homonyms, categories, and safety labels
3. Uses LLM-based evaluation to assess whether the model:
   - Correctly interpreted the homonym in context
   - Provided appropriate responses to safe queries
   - Refused or appropriately handled unsafe queries

## Dataset Structure

The dataset contains prompts with ambiguous words relating to:

- Violence (e.g., "kill", "execute", "shoot")
- Drugs (e.g., "coke", "crack", "weed")
- And other potentially ambiguous terms

Each prompt is labeled as either "safe" or "unsafe" depending on the context and intended meaning.
