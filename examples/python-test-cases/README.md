# Python Test Cases Example

This example demonstrates how to generate test cases using Python. It shows how to:

1. Load test cases from a Python function
2. Generate test cases programmatically
3. Use pandas to load test cases from a CSV file

## Requirements

```bash
pip install pandas
```

## Usage

1. Install the Python dependencies:

```bash
pip install pandas
```

2. Run the evaluation:

```bash
promptfoo eval -c promptfooconfig.yaml
```

The example uses a simple language translation task to demonstrate different ways of generating test cases in Python.

## How it Works

The example shows three different ways to generate test cases:

1. `generate_simple_tests()`: A simple function that returns static test cases
2. `generate_from_csv()`: Shows how to generate test cases from a pandas DataFrame
3. `TestGenerator.generate_systematic_tests()`: A class method that generates test cases systematically

Each method in `test_cases.py` returns a list of test cases that follow the promptfoo test case format.
