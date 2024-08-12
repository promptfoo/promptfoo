---
sidebar_label: FAQ
---

# Frequently Asked Questions

### What is Promptfoo?

Promptfoo is a local-first, open-source tool designed to help evaluate (eval) large language models (LLMs). Promptfoo is designed for application developers and for business applications. It provides a simple, flexible, and extensible API to get started quick and ship GenAI in reliably, safety, and effectively. Key features include:

1. Systematic testing of prompts across multiple LLM providers.
2. Evaluation of LLM outputs using various assertion types.
3. Comprehensive evaluations covering accuracy, safety, and performance metrics.
4. Generation of adversarial tests for LLM red teaming.
5. Seamless result sharing and integration into development pipelines.
6. Support for various use cases and custom assertions.
7. Flexibility to run as a command-line tool, a library, integrate with testing frameworks, or run in your ci/cd pipeline.

Promptfoo operates locally, meaning that your data and API calls remain secure and under your control.

### What is LLM red teaming, and how does Promptfoo support it?

LLM red teaming is the process of systematically testing LLMs to identify potential vulnerabilities, weaknesses, and unintended behaviors before deployment. Promptfoo supports this by offering a framework for generating and executing adversarial tests, aligned with industry standards like OWASP LLM Top 10 and NIST AI Risk Management Framework.

Promptfoo's red teaming capabilities allow you to:

1. Generate adversarial tests specific to your LLM application.
2. Execute tests at scale in a pre-deployment environment.
3. Analyze results to improve AI system safety and reliability.
4. Continuously monitor LLM performance against evolving threats.

For more details, see our [LLM Red Teaming Guide](/docs/guides/llm-redteaming).

### Which LLM providers does Promptfoo support?

Promptfoo supports a wide range of LLM providers, including:

1. OpenAI (GPT-4, GPT-3.5)
2. Anthropic (Claude)
3. Google (PaLM, Gemini)
4. Amazon Bedrock
5. Azure OpenAI
6. Replicate
7. Hugging Face
8. Local models and custom API integrations

Promptfoo's flexible architecture allows for easy integration with new or custom LLM providers. For the most up-to-date list and integration instructions, please refer to our [Providers documentation](/docs/providers/).

## Data Security and Privacy

### Does Promptfoo forward calls to an intermediate server?

No, the source code runs on your machine. Calls to LLM APIs are sent directly to the respective provider. The Promptfoo team does not have access to these requests or responses.

### Does Promptfoo store API keys?

No, API keys are stored as local environment variables and are never transmitted anywhere besides directly to the LLM API.

### Does Promptfoo store LLM inputs and outputs?

No, Promptfoo operates locally, and all data remains on your machine. The only exception is when you explicitly use the [share command](/docs/usage/sharing), which stores inputs and outputs in Cloudflare KV for two weeks.

### Do you collect any PII?

No, we do not collect any personally identifiable information (PII).

## Installation and Getting Started

### How do I install Promptfoo?

1. Ensure you have Node.js 18 or later installed.

2. Install Promptfoo globally using npm:

   ```sh
   npm install -g promptfoo
   ```

   For macOS users who prefer Homebrew:

   ```sh
   brew install promptfoo
   ```

3. Verify the installation:

   ```sh
   promptfoo --version
   ```

### How do I get started with Promptfoo?

1. Initialize a new project:

   ```sh
   promptfoo init my-promptfoo-project
   cd my-promptfoo-project
   ```

2. Explore the generated `promptfooconfig.yaml` file and example prompts.

3. Run your first evaluation:

   ```sh
   promptfoo eval
   ```

For more detailed setup and usage instructions, refer to our [Getting Started documentation](/docs/getting-started).

## Advanced Usage

### How do I use a proxy with Promptfoo?

Promptfoo uses [proxy-agent](https://www.npmjs.com/package/proxy-agent), which respects `HTTP_PROXY` and `HTTPS_PROXY` environment variables in the form of `[protocol://]<host>[:port]`.

### Can I use Promptfoo as a library in my project?

Yes, you can install Promptfoo as a library:

```sh
npm install promptfoo
```

This allows you to integrate Promptfoo's functionality directly into your application or testing framework.

### How does Promptfoo integrate with existing development workflows?

Promptfoo can be integrated into CI/CD pipelines via [GitHub Action](https://github.com/promptfoo/promptfoo-action), used with testing frameworks like Jest and Vitest, and incorporated into various stages of the development process.
