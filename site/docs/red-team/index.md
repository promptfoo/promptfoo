---
sidebar_position: 1
sidebar_label: Intro
title: LLM red teaming guide (open source)
---

# LLM red teaming

LLM red teaming is a proactive approach to finding vulnerabilities in AI systems by simulating malicious inputs.

As of today, there are multiple inherent security challenges with LLM architectures. Depending on your system's design, e.g. [RAG](/docs/red-team/rag/), [LLM agent](/docs/red-team/agents/), or [chatbot](/docs/red-team/llm-vulnerability-types/), you will face different types of vulnerabilities.

Potential vulnerabilities include:

- Information leakage in [RAG applications](/docs/red-team/rag/)
- Misuse of connected tools or APIs in [LLM agents](/docs/red-team/agents/)
- Task scope violations
- Generation of harmful or inappropriate content
- Breaches of business policies or guidelines

:::tip
Ready to run a red team? Jump to **[Quickstart](#quickstart)**.
:::

## How generative AI red teaming works

The process of red teaming gen AI generally requires some degree of automation for a comprehensive evaluation. This is because LLMs have such a wide attack surface.

A systematic approach looks like:

1. Generating a diverse set of adversarial inputs
2. Running these inputs through your LLM application
3. Analyzing the outputs for potential vulnerabilities or undesirable behaviors
4. Providing actionable insights and suggested mitigations

Once a process is set up, it can be applied in two primary ways:

- **One-off runs**: Generate a comprehensive report that allows you to examine vulnerabilities and suggested mitigations.
- **CI/CD integration**: Continuously monitor for vulnerabilities in your deployment pipeline, ensuring ongoing safety as your application evolves.

Promptfoo is an open-source tool for red teaming LLMs that supports all the above.

By systematically probing the LLM application, the end result is a report that quantifies the risk of misuse and provides suggestions for mitigation:

![llm red team report](/img/riskreport-1@2x.png)

### Examples

Promptfoo can generate a wide range of adversarial inputs to test various vulnerabilities:

- [Harmful content](/docs/red-team/plugins/harmful/#examples): Examples of hate speech, offensive content, and other harmful outputs triggered in leading AI models.
- [Broken object-level authorization (BOLA)](/docs/red-team/plugins/bola/#example-test-cases): Test cases for unauthorized access to resources belonging to other users.
- [Broken function-level authorization (BFLA)](/docs/red-team/plugins/bfla/#how-it-works): Prompts attempting to perform actions beyond authorized scope or role.
- [Competitor endorsement](/docs/red-team/plugins/competitors/#example-test-cases): Scenarios where AI might inadvertently promote competing products or services.

See [LLM vulnerability types](/docs/red-team/llm-vulnerability-types/) for more info.

## Red teaming is a core requirement of AI security

Red teaming is different from other AI security approaches because it provides a quantitative measure of risk _before_ deployment. This allows you to build it into your development process and meet AI security standards.

#### Quantifying and managing risk

By running thousands of probes and evaluating the AI's performance, developers can make informed decisions about acceptable risk levels in offline testbeds. Remediation occurs before the application is deployed to production.

#### Continuous testing

Like any product, AI products undergo iteration. A red team process that is built into CI/CD and other workflows allows organization to catch issues early.

#### Compliance

New standards are emerging around the world - ranging from OWASP LLM Top 10 to NIST's AI Risk Management Framework and the EU AI Act. Most regulations and standards require a process that quantifies risk and enables automated testing prior to deployment.

### Best practices for LLM red teaming

Gen AI applications have a wide attack surface, so it's important to automate the process of generating and testing attack inputs.

We recommend implementing a systematic process:

1. **Generate diverse adversarial inputs**: Create a wide range of inputs targeting various [vulnerability types](/docs/red-team/llm-vulnerability-types/).

2. **Run these inputs through your application**: Use an evaluation framework to run these inputs through your system.

3. **Prioritize and address vulnerabilities**: Review flagged issues in the outputs and determine priorities for both the red team and developers based on severity and impact.

Additional best practices to consider:

- **Implement a pre-deployment defense strategy** that quantifies risk before the application is shipped.

- **Integrate red teaming into your development pipeline** to flag vulnerabilities early, meet developers where they are, and address issues before they reach production.

- **Focus on vulnerabilities specific to your application type**, e.g. [RAG](/docs/red-team/rag/), [LLM agents](/docs/red-team/agents/)

- Although industry frameworks are nascent, frameworks like [OWASP LLM Top 10](/docs/red-team/owasp-llm-top-10/) and NIST AI Risk Management Framework can be used as starting points.

## What's next?

To get started and run your first red team, see the [quickstart guide](/docs/red-team/quickstart/).
