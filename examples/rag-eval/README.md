# RAG Evaluation Example

This example demonstrates how to evaluate Retrieval-Augmented Generation (RAG) systems using promptfoo. It helps you:

- Test the quality of retrieved context
- Evaluate answer accuracy with the given context
- Compare different RAG implementations

## Quick Start

```bash
npx promptfoo@latest init --example rag-eval
```

## Configuration

1. Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your_api_key_here
```

2. Review and customize `promptfooconfig.yaml` to:
   - Define your retrieval system
   - Set up test cases with expected contexts
   - Configure evaluation metrics

## Usage

Run the evaluation:

```bash
promptfoo eval
```

View detailed results and analytics:

```bash
promptfoo view
```

## What's Being Tested

This example evaluates several aspects of your RAG system:

- Context relevance
- Answer accuracy
- Hallucination detection
- Source attribution

## Additional Resources

- [RAG Testing Guide](https://promptfoo.dev/docs/guides/rag-testing)
- [Evaluation Metrics](https://promptfoo.dev/docs/configuration/metrics)
- [Example RAG Implementations](https://promptfoo.dev/docs/examples/rag)
