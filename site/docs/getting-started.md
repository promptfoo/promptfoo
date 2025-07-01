---
title: Getting Started
description: Choose your path to get started with Promptfoo - evaluate prompts, red-team applications, or integrate with CI/CD
keywords: [getting started, setup, evaluation, red teaming, CI/CD, llm testing]
sidebar_position: 5
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Getting started

Welcome to Promptfoo! Let's get you started based on what you want to accomplish.

## What would you like to do?

<div className="row margin-bottom--lg">
  <div className="col col--4">
    <div className="card">
      <div className="card__header">
        <h3>🎯 Evaluate my prompts</h3>
      </div>
      <div className="card__body">
        <p>Test and compare prompts across multiple AI models to find what works best.</p>
      </div>
      <div className="card__footer">
        <a href="#evaluate-prompts" className="button button--primary button--block">Start evaluating</a>
      </div>
    </div>
  </div>
  <div className="col col--4">
    <div className="card">
      <div className="card__header">
        <h3>🛡️ Red-team my application</h3>
      </div>
      <div className="card__body">
        <p>Find security vulnerabilities and safety issues before deployment.</p>
      </div>
      <div className="card__footer">
        <a href="/docs/red-team/quickstart/" className="button button--primary button--block">Start red-teaming</a>
      </div>
    </div>
  </div>
  <div className="col col--4">
    <div className="card">
      <div className="card__header">
        <h3>🔄 Integrate with CI/CD</h3>
      </div>
      <div className="card__body">
        <p>Automatically test LLM changes in your development pipeline.</p>
      </div>
      <div className="card__footer">
        <a href="/docs/integrations/ci-cd/" className="button button--primary button--block">Set up CI/CD</a>
      </div>
    </div>
  </div>
</div>

## Evaluate prompts {#evaluate-prompts}

First, make sure you have [Promptfoo installed](/docs/installation).

### Quick start with an example

Get up and running in 30 seconds with a pre-built example:

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      npm install -g promptfoo && promptfoo init --example getting-started
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx promptfoo@latest init --example getting-started
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      brew install promptfoo && promptfoo init --example getting-started
    </CodeBlock>
  </TabItem>
</Tabs>

This creates a complete example that tests translation prompts across different models.

### Build your own evaluation

To create a custom evaluation from scratch:

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      promptfoo init
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx promptfoo@latest init
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo init
    </CodeBlock>
  </TabItem>
</Tabs>

This interactive wizard will help you:

1. Set up prompts to test
2. Choose AI models to compare
3. Define test cases
4. Configure evaluation criteria

### Run your evaluation

Once configured, run your evaluation:

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      promptfoo eval
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx promptfoo@latest eval
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo eval
    </CodeBlock>
  </TabItem>
</Tabs>

View results in the web UI:

<Tabs groupId="promptfoo-command">
  <TabItem value="npm" label="npm" default>
    <CodeBlock language="bash">
      promptfoo view
    </CodeBlock>
  </TabItem>
  <TabItem value="npx" label="npx">
    <CodeBlock language="bash">
      npx promptfoo@latest view
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo view
    </CodeBlock>
  </TabItem>
</Tabs>

![Promptfoo Web UI showing evaluation results](/img/getting-started-web-ui.png)

### Next steps for evaluation

- **[Configuration guide](/docs/configuration/guide)** - Learn about prompts, providers, and test cases
- **[Providers](/docs/providers)** - Connect to 50+ AI models and services
- **[Assertions](/docs/configuration/expected-outputs)** - Automatically validate outputs
- **[Examples](https://github.com/promptfoo/promptfoo/tree/main/examples)** - Explore more use cases

## Other paths

### 🛡️ Red-teaming

Find vulnerabilities in your LLM applications before attackers do.

- **[Red-team quickstart](/docs/red-team/quickstart/)** - Run your first security scan
- **[Vulnerability types](/docs/red-team/llm-vulnerability-types/)** - Understand common LLM risks
- **[Strategies](/docs/red-team/strategies/)** - Advanced attack techniques

### 🔄 CI/CD Integration

Ensure quality with every code change.

- **[GitHub Actions](/docs/integrations/github-action/)** - Automate testing in GitHub
- **[CI/CD guide](/docs/integrations/ci-cd/)** - General integration patterns
- **[Web API](/docs/usage/self-hosting/)** - Self-host for enterprise deployments

### 📊 Advanced use cases

- **[RAG evaluation](/docs/guides/evaluate-rag/)** - Test retrieval-augmented generation
- **[Agent testing](/docs/red-team/agents/)** - Evaluate autonomous agents
- **[Custom providers](/docs/providers/custom-api/)** - Test any LLM system

## Get help

- 💬 [Join our Discord](https://discord.gg/promptfoo) for community support
- 📖 [Browse documentation](/docs/intro/)
- 🐛 [Report issues on GitHub](https://github.com/promptfoo/promptfoo/issues)
