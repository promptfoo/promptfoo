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

### Why should I use promptfoo?

Promptfoo offers several key benefits for developers and organizations working with LLMs:

1. Improved reliability: By systematically testing prompts and LLM outputs, you can identify and fix issues before they affect your users.
2. Enhanced safety: Our red teaming capabilities help you proactively detect and mitigate potential vulnerabilities in your AI systems.
3. Cost optimization: By evaluating prompt effectiveness, you can reduce unnecessary API calls and optimize your LLM usage.
4. Streamlined workflow: Promptfoo integrates seamlessly into your development pipeline, making it easy to maintain high-quality AI applications.
5. Multi-provider support: Test your prompts across various LLM providers to ensure consistency and find the best fit for your needs.
6. Open-source flexibility: As an open-source tool, promptfoo can be customized and extended to meet your specific requirements.

Whether you're developing a chatbot, RAG system, or any other LLM-powered application, promptfoo can help you build more robust, efficient, and trustworthy AI systems.

### Which LLM providers does promptfoo support?

Promptfoo supports a wide range of LLM providers, including:

1. OpenAI (GPT-4o, GPT-4, GPT-3.5)
2. Anthropic (Claude)
3. Google (PaLM, Gemini)
4. Amazon Bedrock (Anthropic, Llama, etc.)
5. Azure OpenAI
6. Replicate (llama3.1, llama3, etc.)
7. Hugging Face
8. Local models and custom API integrations

For the most up-to-date list of supported providers and detailed integration instructions, please refer to our [Providers documentation](/docs/providers/).

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

### How do I get started with promptfoo?

Getting started with promptfoo is quick and easy:

1. Install Node.js 18 or later if you haven't already.

2. Install promptfoo globally using npm:

   ```sh
   npm install -g promptfoo
   ```

3. Use the `init` command to create a new project with a sample configuration:

   ```sh
   promptfoo init my-promptfoo-project
   cd my-promptfoo-project
   ```

   This command sets up a basic project structure with a `promptfooconfig.yaml` file and example prompts.

4. Explore the generated files and customize them for your needs.

5. Run your first evaluation:

   ```sh
   promptfoo eval
   ```

You can also explore our extensive collection of examples: [examples](https://github.com/promptfoo/promptfoo/tree/main/examples/). They cover a wide range of use cases and configurations, from simple prompt testing to complex multi-provider evaluations and custom assertions. For a comprehensive guide that includes detailed configuration options and best practices, please refer to our [Getting Started documentation](/docs/getting-started).
