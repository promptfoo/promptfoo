---
sidebar_position: 1
description: Evaluate and secure LLM applications with automated testing, red teaming, and benchmarking. Compare outputs across 50+ providers.
---

# Intro

Promptfoo is an [open-source](https://github.com/promptfoo/promptfoo) CLI and library for testing LLM applications. Define test inputs, run them against prompts or applications, and compare the outputs against your requirements.

With promptfoo, you can:

- Compare prompts or models on the same [test cases](/docs/configuration/guide).
- Check outputs automatically with [assertions and metrics](/docs/configuration/expected-outputs).
- Probe application security with [red teaming](/docs/red-team).
- Run tests through the [CLI](/docs/usage/command-line), [Node library](/docs/usage/node-package), or [CI/CD](/docs/integrations/github-action).

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

Use Promptfoo when you want test cases and assertions that you can keep in version control and rerun after a change. Connect a [model provider](/docs/providers), an [HTTP endpoint](/docs/providers/http), or custom application code, then inspect results in the web UI or [export them](/docs/configuration/outputs).

The CLI runs on your machine. Target requests and model-based grading use the providers you configure, and red teaming can use [remote generation](/docs/red-team/troubleshooting/remote-generation). Choose those services according to your data-handling requirements.

## Workflow and philosophy

Keep representative inputs and known failures in a test suite. Rerun it when you change a prompt, model, or application component:

1. **Define test cases**: Identify core use cases and failure modes. Prepare a set of prompts and test cases that represent these scenarios.
2. **Configure evaluation**: Set up your evaluation by specifying prompts, test cases, and API providers.
3. **Run evaluation**: Use the command-line tool or library to execute the evaluation and record model outputs for each prompt.
4. **Analyze results**: Set up automatic requirements, or review results in a structured format/web UI. Use these results to select the best model and prompt for your use case.
5. **Feedback loop**: As you gather more examples and user feedback, continue to expand your test cases.

<div style={{backgroundColor: 'var(--ifm-background-surface-color)', padding: '1rem', borderRadius: '8px'}}>

![llm evaluation flow](/img/llm-evaluation-flow.svg)

</div>
