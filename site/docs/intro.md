---
sidebar_position: 1
description: Evaluate and secure LLM applications with automated testing, red teaming, and benchmarking. Compare outputs across 50+ providers.
---

# Intro

`promptfoo` is an [open-source](https://github.com/promptfoo/promptfoo) CLI and library for evaluating and red-teaming LLM apps.

With promptfoo, you can:

- **Build reliable prompts, models, and RAGs** with benchmarks specific to your use-case
- **Find security vulnerabilities** with automated [red teaming](/docs/red-team) and pentesting
- **Speed up evaluations** with caching, concurrency, and live reloading
- **Score outputs automatically** by defining [metrics](/docs/configuration/expected-outputs)
- Use as a [CLI](/docs/usage/command-line), [library](/docs/usage/node-package), or in [CI/CD](/docs/integrations/github-action)
- Use OpenAI, Anthropic, Azure, Google, HuggingFace, open-source models like Llama, or integrate custom API providers for [any LLM API](/docs/providers)

:::tip Get Started

- [**Red teaming**](/docs/red-team/quickstart) - Scan for security vulnerabilities and compliance risks
- [**Evaluations**](/docs/getting-started) - Test quality and accuracy of your prompts, models, and applications

:::

promptfoo produces matrix views that let you quickly evaluate outputs across many prompts.

Here's an example of a side-by-side comparison of multiple prompts and inputs:

![Side-by-side evaluation of LLM prompt quality](/img/docs/self-grading-results.jpg)

It works on the command line too.

![promptfoo command line evaluation](/img/docs/self-grading-cli.jpg)

Promptfoo also produces high-level vulnerability and risk reports:

![gen ai red team](/img/docs/redteam-dashboard.jpg)

## Why choose promptfoo?

- **Developer friendly**: promptfoo is fast, with quality-of-life features like live reloads and caching.
- **Production use**: Originally built for LLM apps serving over 10 million users.
- **Simple, declarative test cases**: Define evals without writing code or working with heavy notebooks.
- **Language agnostic**: Use Python, Javascript, or any other language.
- **Share & collaborate**: Built-in share functionality & web viewer for working with teammates.
- **Open source**: Inspect and modify the code on GitHub.
- **Local execution**: Evals run on your machine and call the configured providers. Red team generation may use hosted services. See [data handling](/docs/red-team/troubleshooting/data-handling).

## Workflow and philosophy

Use repeatable tests to compare prompts and models, then add cases as you find failures.

1. **Define test cases**: Identify core use cases and failure modes. Prepare a set of prompts and test cases that represent these scenarios.
2. **Configure evaluation**: Set up your evaluation by specifying prompts, test cases, and API providers.
3. **Run evaluation**: Use the command-line tool or library to execute the evaluation and record model outputs for each prompt.
4. **Analyze results**: Set up automatic requirements, or review results in a structured format/web UI. Use these results to select the best model and prompt for your use case.
5. **Feedback loop**: As you gather more examples and user feedback, continue to expand your test cases.

<div style={{backgroundColor: 'var(--ifm-background-surface-color)', padding: '1rem', borderRadius: '8px'}}>

![llm evaluation flow](/img/llm-evaluation-flow.svg)

</div>
