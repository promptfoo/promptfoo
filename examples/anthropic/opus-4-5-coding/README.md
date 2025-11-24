# opus-4-5-coding (Claude Opus 4.5 Advanced Coding)

This example demonstrates Claude Opus 4.5's state-of-the-art coding and reasoning capabilities, showcasing its ability to handle complex software engineering tasks with ambiguity and tradeoff analysis.

You can run this example with:

```bash
npx promptfoo@latest init --example opus-4-5-coding
```

## What This Tests

Claude Opus 4.5 is the best model in the world for coding, agents, and computer use. This example evaluates:

- **Complex code analysis**: Understanding multi-file codebases and architectural decisions
- **Bug diagnosis**: Identifying root causes in complex, multi-system scenarios
- **Ambiguity handling**: Making informed decisions when requirements are unclear
- **Tradeoff reasoning**: Evaluating different approaches and explaining pros/cons
- **Code generation**: Writing high-quality, production-ready code

## Features Demonstrated

1. **State-of-the-art coding**: Opus 4.5 achieves the highest score on SWE-bench Verified among frontier models
2. **Reasoning about tradeoffs**: The model excels at analyzing different approaches and making informed decisions
3. **Handling ambiguity**: Unlike models that require hand-holding, Opus 4.5 figures things out
4. **Extended thinking**: Support for thinking budgets up to 128K tokens for complex reasoning

## Running the Example

```bash
# Set your API key
export ANTHROPIC_API_KEY=your_api_key_here

# Run the evaluation
npx promptfoo@latest eval

# View results
npx promptfoo@latest view
```

## Expected Results

The evaluation tests Opus 4.5's ability to:

- Diagnose bugs across multiple system boundaries
- Choose appropriate data structures with clear reasoning
- Write production-quality code with proper error handling
- Analyze architectural decisions and propose improvements

## Learn More

- [Claude Opus 4.5 announcement](https://www.anthropic.com/news/claude-opus-4-5)
- [Anthropic documentation](https://docs.anthropic.com)
- [Promptfoo Anthropic provider docs](https://promptfoo.dev/docs/providers/anthropic)
