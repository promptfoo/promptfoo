# BeaverTails Red Team Testing

This example demonstrates how to use the BeaverTails plugin for red team testing, including subcategory filtering.

## Overview

The BeaverTails plugin uses the [BeaverTails dataset](https://huggingface.co/datasets/PKU-Alignment/BeaverTails) (330k harmful prompts) to test AI safety boundaries. The subcategory filtering feature allows you to focus on specific harm categories relevant to your application.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-beavertails
```

## Configuration Files

This example includes two configuration files:

1. **`promptfooconfig.yaml`** - Basic evaluation using HuggingFace dataset directly
2. **`promptfooconfig-subcategories.yaml`** - Red team generation with subcategory filtering

## Setup

1. Set up your HuggingFace API token (required for both configs):

   ```bash
   export HF_TOKEN=your_huggingface_token
   ```

2. Set up your provider API key:

   ```bash
   export OPENAI_API_KEY=your_openai_api_key
   ```

## Usage

### Basic Evaluation

Run the basic evaluation using the BeaverTails-Evaluation dataset:

```bash
promptfoo eval
```

View results:

```bash
promptfoo view
```

### Red Team with Subcategory Filtering

Generate test cases with subcategory filtering:

```bash
promptfoo redteam generate -c promptfooconfig-subcategories.yaml
```

This will create a `redteam.yaml` file with filtered test cases.

Then evaluate your model:

```bash
promptfoo eval
```

View results:

```bash
promptfoo view
```

## Subcategory Filtering

The `promptfooconfig-subcategories.yaml` configuration shows two approaches:

1. **Basic usage** - Tests all harmful categories:

   ```yaml
   - id: beavertails
     numTests: 5
   ```

2. **Filtered usage** - Tests only specific subcategories:

   ```yaml
   - id: beavertails
     numTests: 5
     config:
       subcategories:
         - self_harm
         - privacy_violation
   ```

### Available Subcategories

- `animal_abuse` - Cruelty, harm, or distress to animals
- `child_abuse` - Physical, emotional, or sexual abuse of minors
- `controversial_topics,politics` - Sensitive political or social issues
- `discrimination,stereotype,injustice` - Unfair treatment based on characteristics
- `drug_abuse,weapons,banned_substance` - Illegal substance or weapon misuse
- `financial_crime,property_crime,theft` - Fraud, embezzlement, theft
- `hate_speech,offensive_language` - Hostile communication targeting groups
- `misinformation_regarding_ethics,laws_and_safety` - False information about critical topics
- `non_violent_unethical_behavior` - Morally wrong actions without violence
- `privacy_violation` - Unauthorized access or disclosure of personal information
- `self_harm` - Self-inflicted harm or suicidal content
- `sexually_explicit,adult_content` - Inappropriate sexual material
- `terrorism,organized_crime` - Terrorist or organized crime content
- `violence,aiding_and_abetting,incitement` - Physical harm or encouragement

## Learn More

- [BeaverTails Plugin Documentation](https://promptfoo.dev/docs/red-team/plugins/beavertails/)
- [Red Team Testing Guide](https://promptfoo.dev/docs/red-team/quickstart/)
