---
sidebar_position: 1
pagination_next: /docs/getting-started
---

# Intro

`promptfoo` is an [open-source](https://github.com/promptfoo/promptfoo) CLI and library for evaluating and red-teaming LLMs, LLM-powered apps, and Agents.

With promptfoo, you can:

- **Build reliable prompts, models, RAGs, and Agents** with benchmarks specific to your use case
- **Secure your apps** with automated [red teaming](/docs/red-team) and pentesting
- **Speed up evaluations** with caching, concurrency, and live reloading
- **Score outputs automatically** with over 50 built-in [metrics](/docs/configuration/expected-outputs)
- Use as a [CLI](/docs/usage/command-line), [library](/docs/usage/node-package), or in [CI/CD](/docs/integrations/github-action)
- Use OpenAI, Anthropic, Azure, Google, HuggingFace, open-source models like Llama, or integrate custom API providers for [any LLM API](/docs/providers)

Promptfoo is a tool for **test-driven LLM development**, not trial-and-error.

<div style={{ 
  border: '1px solid var(--ifm-color-success-darkest)',
  borderRadius: '4px',
  padding: '1rem',
  paddingTop: '2rem',
  backgroundColor: 'var(--ifm-color-success-contrast-background)',
  marginBottom: '1rem',
  color: 'var(--ifm-font-color-base)'
}}>

**Get Started:**

- [**Red teaming**](/docs/red-team/quickstart) - LLM security scans
- [**Evaluations**](/docs/getting-started) - LLM quality benchmarks

</div>

promptfoo produces matrix views that let you quickly evaluate outputs across many prompts.

Here's an example of a side-by-side comparison of multiple prompts and inputs:

![Side-by-side evaluation of LLM prompt quality](https://github.com/promptfoo/promptfoo/assets/310310/ce5a7817-da82-4484-b26d-32474f1cabc5)

It works on the command line too:

![LLM prompt quality evaluation with PASS/FAIL expectations](https://user-images.githubusercontent.com/310310/236690475-b05205e8-483e-4a6d-bb84-41c2b06a1247.png)

Promptfoo also produces high-level vulnerability and risk reports:

![gen ai red team](/img/riskreport-1@2x.png)

## Why choose promptfoo?

There are many different ways to evaluate prompts. Here are some reasons to consider promptfoo:

- **Developer friendly**: promptfoo is fast, with quality-of-life features like live reloads and caching.
- **Battle-tested**: Originally built for LLM apps serving over 200 million users in production. Our tooling is flexible and can be adapted to many setups.
- **Trusted**: Used by over 2,000 companies to evaluate and secure their LLM applications.
- **Private**: This software runs completely locally. The evals run on your machine and talk directly with the LLM.
- **Simple, declarative test cases**: Define evals without writing code or working with heavy notebooks.
- **Language agnostic**: Use Python, Javascript, or any other language.
- **Share & collaborate**: Built-in share functionality & web viewer for working with teammates.
- **Open-source**: LLM evals are a commodity and should be served by 100% open-source projects. Promptfoo is MIT licensed, with no strings attached.
- **Featured in**: [OpenAI Build Hours](https://vimeo.com/1023317525/be082a1029) and [Anthropic Courses](https://github.com/anthropics/courses/tree/master/prompt_evaluations).

## Workflow and philosophy

Test-driven prompt engineering is much more effective than trial-and-error.

[Serious LLM development requires a systematic approach to prompt engineering](https://www.ianww.com/blog/2023/05/21/prompt-engineering-framework). Promptfoo streamlines the process of evaluating and improving language model performance.

1. **Define test cases**: Identify core use cases and failure modes. Prepare a set of prompts and test cases that represent these scenarios.
2. **Configure evaluation**: Set up your evaluation by specifying prompts, test cases, and API providers.
3. **Run evaluation**: Use the command-line tool or library to execute the evaluation and record model outputs for each prompt.
4. **Analyze results**: Set up automatic requirements, or review results in a structured format/web UI. Use these results to select the best model and prompt for your use case.
5. **Feedback loop**: As you gather more examples and user feedback, continue to expand your test cases.

![llm evaluation flow](/img/llm-evaluation-flow.svg)
