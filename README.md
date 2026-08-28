Promptfoo: LLM evals & red teaming

<p align="center">

  

  

  

  

  

</p>

<p align="center">

  <code>promptfoo</code> is a CLI and library for evaluating and red-teaming LLM apps. Stop the trial-and-error approach - start shipping secure, reliable AI apps.

</p>

<p align="center">

  Website ·

  Getting Started ·

  Red Teaming ·

  Documentation ·

  Discord

</p>

Promptfoo is now part of OpenAI. Promptfoo remains open source and MIT licensed. Read the company update.

Quick Start

Requires Node.js >=22.22.0 for npm and npx usage. Node.js 24 LTS

is recommended; see the runtime support guide.

    npm install -g promptfoo
    promptfoo init --example getting-started

Also available via brew install promptfoo and pip install promptfoo. You can also use npx promptfoo@latest to run any command without installing.

Most LLM providers require an API key. Set yours as an environment variable:

    export OPENAI_API_KEY=sk-abc123

Once you're in the example directory, run an eval and view results:

    cd getting-started
    promptfoo eval
    promptfoo view

See Getting Started (evals) or Red Teaming (vulnerability scanning) for more.

What can you do with Promptfoo?

- Test your prompts and models with automated evaluations
- Secure your LLM apps with red teaming and vulnerability scanning
- Compare models side-by-side (OpenAI, Anthropic, Azure, Bedrock, Ollama, and more)
- Automate checks in CI/CD
- Review pull requests for LLM-related security and compliance issues with code scanning
- Share results with your team

Here's what it looks like in action:



It works on the command line too:



It also can generate security vulnerability reports:



Why Promptfoo?

- Developer-first: Fast, with features like live reload and caching
- Private: LLM evals run 100% locally - your prompts never leave your machine
- Flexible: Works with any LLM API or programming language
- Battle-tested: Powers LLM apps serving 10M+ users in production
- Data-driven: Make decisions based on metrics, not gut feel
- Open source: MIT licensed, with an active community

Learn More

- Getting Started
- Full Documentation
- Red Teaming Guide
- CLI Usage
- Node.js Package
- Supported Models
- Code Scanning Guide

Contributing

We welcome contributions! Check out our contributing guide to get started.

Join our Discord community for help and discussion.

<a href="https://github.com/promptfoo/promptfoo/graphs/contributors">

  

</a>
