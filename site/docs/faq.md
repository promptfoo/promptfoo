---
sidebar_label: FAQ
---

# Frequently Asked Questions

### What is promptfoo?

Promptfoo is a local-first, open-source tool for testing and evaluating AI prompts and language models (LLMs). It allows developers and AI practitioners to:

1. Systematically test prompts across multiple LLM providers
2. Evaluate LLM outputs via dozens of deterministic and model graded assertion types.
3. Perform comprehensive evaluations, including accuracy, safety, and performance metrics.
4. Generate adversarial tests for LLM red teaming.
5. Share results with your team.

Promptfoo helps ensure the reliability, safety, and effectiveness of AI systems by providing a robust framework for prompt engineering and LLM evaluation.

### Does promptfoo forward calls to an intermediate server?

No, the source code is executed on your machine. Any calls to LLM APIs (such as OpenAI, Anthropic, etc.) are sent directly to the LLM provider. The authors of promptfoo do not have access to these requests or responses.

### Does promptfoo store API keys?

No, API keys are set as local environment variables and are never transmitted anywhere besides directly to the LLM API (e.g., OpenAI, Anthropic).

### Does promptfoo store LLM inputs and outputs?

No, promptfoo runs locally, and all data remains on your machine.

If you _explicitly_ run the [share command](/docs/usage/sharing), then your inputs/outputs are stored in Cloudflare KV for 2 weeks. This only happens when you run `promptfoo share` or click the "Share" button in the web UI.

### Do you collect any PII?

No, we do not collect any personally identifiable information (PII).

### How do I use a proxy?

Requests to most providers are made via [proxy-agent](https://www.npmjs.com/package/proxy-agent), which respects `HTTP_PROXY` and `HTTPS_PROXY` [environment variables](https://www.npmjs.com/package/proxy-from-env#environment-variables) in the form of `[protocol://]<host>[:port]`.

### What is LLM red teaming, and how does promptfoo support it?

LLM red teaming is a process of systematically testing Large Language Models (LLMs) to identify potential vulnerabilities, weaknesses, and unintended behaviors before deployment. Promptfoo supports LLM red teaming by providing a comprehensive framework for generating and executing adversarial tests based on your specific use case, aligned with industry standards and best practices.

Promptfoo's red teaming framework is designed to address vulnerabilities outlined in the OWASP LLM Top 10 and aligns with NIST AI Risk Management Framework guidelines. It allows you to:

1. Automatically generate adversarial tests tailored to your specific LLM application
2. Execute these tests at scale in a pre-deployment environment
3. Analyze results to identify areas for improvement in your AI system's safety and reliability
4. Continuously monitor and evaluate your LLM's performance against evolving threats

By integrating promptfoo's red teaming capabilities into your development pipeline, you can proactively identify and mitigate potential risks before they impact end-users, resulting in more secure and reliable applications.

For more detailed information on our red teaming capabilities and how they align with industry standards, please refer to our [LLM Red Teaming Guide](/docs/guides/llm-redteaming).
