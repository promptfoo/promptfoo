---
sidebar_position: 25
---

# Dataset generation

Your dataset is the heart of your LLM eval. To the extent possible, it should closely represent true inputs into your LLM app.

promptfoo can extend existing datasets and help make them more comprehensive and diverse using the `promptfoo generate dataset` command. This guide will walk you through the process of generating datasets using `promptfoo`.

### Prepare your prompts

Before generating a dataset, you need to have your `prompts` ready, and _optionally_ `tests`:

```yaml
prompts:
  - 'Act as a travel guide for {{location}}'
  - 'I want you to act as a travel guide. I will write you my location and you will suggest a place to visit near my location. In some cases, I will also give you the type of places I will visit. You will also suggest me places of similar type that are close to my first location. My current location is {{location}}'

tests:
  - vars:
      location: 'San Francisco'
  - vars:
      location: 'Wyoming'
  - vars:
      location: 'Kyoto'
  - vars:
      location: 'Great Barrier Reef'
```

### Run `promptfoo generate dataset`

Dataset generation uses your prompts and any existing test cases to generate new, unique test cases that can be used for evaluation.

Run the command in the same directory as your config:

```sh
promptfoo generate dataset
```

This will output the `tests` YAML to your terminal.

If you want to write the new dataset to a file:

```sh
promptfoo generate dataset -o tests.yaml
```

Or if you want to edit the existing config in-place:

```sh
promptfoo generate dataset -w
```

### Customize the generation process

You can customize the dataset generation process by providing additional options to the `promptfoo generate dataset` command. Below is a table of supported parameters:

| Parameter                  | Description                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| `-c, --config`             | Path to the configuration file.                                         |
| `-i, --instructions`       | Specific instructions for the LLM to follow when generating test cases. |
| `-o, --output`             | Path to the output file where the dataset will be saved.                |
| `-w, --write`              | Write the generated test cases directly to the configuration file.      |
| `--numPersonas`            | Number of personas to generate for the dataset.                         |
| `--numTestCasesPerPersona` | Number of test cases to generate per persona.                           |
| `--provider`               | Provider to use for the dataset generation. Eg: openai:chat:gpt-4o      |

For example:

```sh
promptfoo generate dataset --config path_to_config.yaml --output path_to_output.yaml --instructions "Consider edge cases related to international travel"
```
