---
sidebar_label: FAQ
---

# Frequently asked questions

### What is Promptfoo?

Promptfoo is a local-first, open-source tool designed to help evaluate (eval) large language models (LLMs). Promptfoo is designed for application developers and for business applications. It features a simple, flexible, and extensible API. With Promptfoo you can:

1. Systematically test prompts across multiple LLM providers.
2. Evaluate LLM outputs using various assertion types.
3. Calculate metrics like accuracy, safety, and performance.
4. Generate adversarial tests for LLM red teaming.
5. Run as a command-line tool, a library, integrate with testing frameworks, run in your ci/cd pipeline, and view results in the browser.

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

1. OpenAI (GPT-4o, GPT-3.5)
2. Anthropic (Claude)
3. Google (PaLM, Gemini)
4. Amazon Bedrock
5. Azure OpenAI
6. Replicate
7. Hugging Face
8. Local models and custom API integrations

Promptfoo's flexible architecture allows for easy integration with new or custom LLM providers. For the most up-to-date list and integration instructions, please refer to our [Providers documentation](/docs/providers/).

### Does Promptfoo forward calls to an intermediate server?

No, the source code runs on your machine. Calls to LLM APIs are sent directly to the respective provider. The Promptfoo team does not have access to these requests or responses.

### Does Promptfoo store API keys?

No, API keys are stored as local environment variables and are never transmitted anywhere besides directly to the LLM API.

### Does Promptfoo store LLM inputs and outputs?

No, Promptfoo operates locally, and all data remains on your machine. The only exception is when you explicitly use the [share command](/docs/usage/sharing), which stores inputs and outputs in Cloudflare KV for two weeks.

### Do you collect any PII?

No, we do not collect any personally identifiable information (PII).

### How do I use a proxy with Promptfoo?

Requests to most providers are made via [proxy-agent](https://www.npmjs.com/package/proxy-agent), which respects `HTTP_PROXY` and `HTTPS_PROXY` [environment variables](https://www.npmjs.com/package/proxy-from-env#environment-variables) of the form `[protocol://]<host>[:port]`.

### How does Promptfoo integrate with existing development workflows?

Promptfoo can be integrated into CI/CD pipelines via [GitHub Action](https://github.com/promptfoo/promptfoo-action), used with testing frameworks like Jest and Vitest, and incorporated into various stages of the development process.
