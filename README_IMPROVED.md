# Promptfoo: LLM evals & red teaming

<p align="center">
  <a href="https://npmjs.com/package/promptfoo">
    <img src="https://img.shields.io/npm/v/promptfoo" alt="npm version" />
  </a>
  <a href="https://npmjs.com/package/promptfoo">
    <img src="https://img.shields.io/npm/dm/promptfoo" alt="npm downloads" />
  </a>
  <a href="https://github.com/promptfoo/promptfoo/actions/workflows/main.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/typpo/promptfoo/main.yml" alt="GitHub Workflow Status" />
  </a>
  <a href="https://github.com/promptfoo/promptfoo/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/promptfoo/promptfoo" alt="MIT license" />
  </a>
  <a href="https://discord.gg/promptfoo">
    <img src="https://github.com/user-attachments/assets/2092591a-ccc5-42a7-aeb6-24a2808950fd" alt="Discord" />
  </a>
</p>

<p align="center">
  `promptfoo` is a developer-friendly local tool for testing LLM applications. Stop the trial-and-error approach - start shipping secure, reliable AI apps.
</p>

<p align="center">
  <a href="https://www.promptfoo.dev">Official Website</a> ·
  <a href="https://www.promptfoo.dev/docs/getting-started/">Getting Started</a> ·
  <a href="https://www.promptfoo.dev/docs/red-team/">Red Teaming</a> ·
  <a href="https://www.promptfoo.dev/docs/">Documentation</a> ·
  <a href="https://discord.gg/promptfoo">Community</a>
</p>

## Quick Start

> Before installing promptfoo, make sure your machine has Node.js installed.

```sh
# Install and initialize project
npx promptfoo@latest init

# Run your first evaluation
npx promptfoo eval
```

See [Getting Started](https://www.promptfoo.dev/docs/getting-started/) (evals) or [Red Teaming](https://www.promptfoo.dev/docs/red-team/) (vulnerability scanning) for more.

## What can you do with Promptfoo?

- **Test your prompts and models** with [automated evaluations](https://www.promptfoo.dev/docs/getting-started/)
- **Secure your LLM apps** with [red teaming](https://www.promptfoo.dev/docs/red-team/) and vulnerability scanning
- **Compare models** side-by-side (OpenAI, Anthropic, Azure, Bedrock, Ollama, and [more](https://www.promptfoo.dev/docs/providers/))
- **Automate checks** in [CI/CD](https://www.promptfoo.dev/docs/integrations/ci-cd/)
- **Share results** with your team

Here's what it looks like in action:

![prompt evaluation matrix - web viewer](https://www.promptfoo.dev/img/claude-vs-gpt-example@2x.png)

It works on the command line too:

![prompt evaluation matrix - command line](https://github.com/promptfoo/promptfoo/assets/310310/480e1114-d049-40b9-bd5f-f81c15060284)

It also can generate [security vulnerability reports](https://www.promptfoo.dev/docs/red-team/):

![gen ai red team](https://www.promptfoo.dev/img/riskreport-1@2x.png)

## Why promptfoo?

- 🚀 **Developer-first**: Fast, with features like live reload and caching
- 🔒 **Private**: Runs 100% locally - your prompts never leave your machine
- 🔧 **Flexible**: Works with any LLM API or programming language
- 💪 **Battle-tested**: Powers LLM apps serving 10M+ users in production
- 📊 **Data-driven**: Make decisions based on metrics, not gut feel
- 🤝 **Open source**: MIT licensed, with an active community

## Feature Comparison

<table style="width: 100%;">
  <tr>
    <th align="center">Feature</th>
    <th align="center">promptfoo</th>
    <th align="center">Manual Testing</th>
    <th align="center">OpenAI Evals</th>
    <th align="center">Other Tools</th>
  </tr>
  <tr>
    <td align="center">Local Testing</td>
    <td align="center">✅</td>
    <td align="center">✅</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
  </tr>
  <tr>
    <td align="center">Data Privacy</td>
    <td align="center">✅</td>
    <td align="center">✅</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
  </tr>
  <tr>
    <td align="center">Multi-Model Comparison</td>
    <td align="center">✅</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
  </tr>
  <tr>
    <td align="center">Red Teaming</td>
    <td align="center">✅</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
  </tr>
  <tr>
    <td align="center">CI/CD Integration</td>
    <td align="center">✅</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
    <td align="center">⚠️</td>
  </tr>
  <tr>
    <td align="center">Developer-first</td>
    <td align="center">✅</td>
    <td align="center">❌</td>
    <td align="center">❌</td>
    <td align="center">⚠️</td>
  </tr>
  <tr>
    <td align="center">Open Source</td>
    <td align="center">✅</td>
    <td align="center">N/A</td>
    <td align="center">✅</td>
    <td align="center">⚠️</td>
  </tr>
</table>

## Star the Project ⭐

If you find promptfoo useful, please consider giving it a star on GitHub! It helps us grow and improve the project.

<p align="center">
  <img src="./public/assets/star-animation.gif" alt="Star us on GitHub!" width="800" />
</p>

## Learn More

- 📚 [Full Documentation](https://www.promptfoo.dev/docs/intro/)
- 🔐 [Red Teaming Guide](https://www.promptfoo.dev/docs/red-team/)
- 🎯 [Getting Started](https://www.promptfoo.dev/docs/getting-started/)
- 💻 [CLI Usage](https://www.promptfoo.dev/docs/usage/command-line/)
- 📦 [Node.js Package](https://www.promptfoo.dev/docs/usage/node-package/)
- 🤖 [Supported Models](https://www.promptfoo.dev/docs/providers/)

## Community & Contact

- [Github Discussions](https://github.com/promptfoo/promptfoo/discussions). Best for: sharing feedback and asking questions.
- [GitHub Issues](https://github.com/promptfoo/promptfoo/issues). Best for: bugs you encounter using promptfoo, and feature proposals.
- [Discord](https://discord.gg/promptfoo). Best for: sharing your applications and hanging out with the community.
- [Twitter](https://twitter.com/promptfoo). Best for: staying updated with the latest news and features.

## Contributing

We welcome contributions! Check out our [contributing guide](https://www.promptfoo.dev/docs/contributing/) to get started.

Join our [Discord community](https://discord.gg/promptfoo) for help and discussion.

<a href="https://github.com/promptfoo/promptfoo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=promptfoo/promptfoo" />
</a>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=promptfoo/promptfoo&type=Date)](https://star-history.com/#promptfoo/promptfoo&Date)
