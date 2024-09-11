---
sidebar_position: 1
sidebar_label: Intro
title: LLM red teaming guide (open source)
---

# LLM red teaming

LLM red teaming is a proactive approach to finding vulnerabilities in AI systems by simulating malicious inputs.

As of today, there are multiple inherent security challenges with LLM architectures. Depending on your system's design, e.g. [RAG](/docs/red-team/rag/), [LLM agent](/docs/red-team/agents/), or [chatbot](/docs/red-team/llm-vulnerability-types/), you'll face different types of vulnerabilities.

Almost every LLM app has potential issues with generation of off-topic, inappropriate, or harmful content that breaches business policies or other guidelines. As architectures become more complex, problems can arise in the form of information leakage and access control (RAG architectures), misuse of connected APIs or databases (in agents), and more.

The purpose of red teaming is to identify and address these vulnerabilities before they make it to production.

In order to do this, we need to systematically generate a wide range of adversarial inputs and evaluate the LLM's responses.

:::tip
Ready to run a red team? Jump to **[Quickstart](/docs/red-team/quickstart/)**.
:::

## How generative AI red teaming works

The process of red teaming gen AI generally requires some degree of automation for a comprehensive evaluation. This is because LLMs have such a wide attack surface and are stochastic in nature (i.e. they are not consistent from one generation to the next).

A systematic approach looks like this:

1. Generate a diverse set of adversarial inputs
2. Run these inputs through your LLM application
3. Analyze the outputs for vulnerabilities or undesirable behaviors

Once a process is set up, it can be applied in two primary ways:

- **One-off runs**: Generate a comprehensive report that allows you to examine vulnerabilities and suggested mitigations.
- **CI/CD integration**: Continuously monitor for vulnerabilities in your deployment pipeline, ensuring ongoing safety as your application evolves.

By systematically probing the LLM application, the end result is a report that quantifies the risk of misuse and provides suggestions for mitigation:

![llm red team report](/img/riskreport-1@2x.png)

### White box vs black box testing

White box testing of LLMs involves having full access to the model's architecture, training data, and internal weights. This enables highly effective attack algorithms like [greedy coordinate descent](https://github.com/llm-attacks/llm-attacks) and [AutoDAN](https://arxiv.org/abs/2310.04451).

The downside of these white box attacks is that they tend to be slow and are adapted to specific characteristics of the model. Additionally, most developers are not building with models that are exposed via their weights, so this approach is not practical for most use cases.

On the other hand, black box testing treats the LLM as a closed system, where only inputs and outputs are observable. This approach simulates real-world scenarios where attackers don't have insider knowledge.

Both methods have their merits in red teaming:

- White box testing can uncover deeper, structural vulnerabilities.
- Black box testing is more representative of real-world attack scenarios and can reveal unexpected behaviors.

For most developers and AppSec teams, black box testing is the most practical approach, especially because more easily incorporates the real world infra of RAGs and agents.

### Examples

Promptfoo is an open-source tool for red teaming LLMs that supports all the above. It can generate a wide range of adversarial inputs to test various vulnerabilities:

- [Harmful content](/docs/red-team/plugins/harmful/#examples): Examples of hate speech, offensive content, and other harmful outputs triggered in leading AI models.
- [Broken object-level authorization (BOLA)](/docs/red-team/plugins/bola/#example-test-cases): Test cases for unauthorized access to resources belonging to other users.
- [Broken function-level authorization (BFLA)](/docs/red-team/plugins/bfla/#how-it-works): Prompts attempting to perform actions beyond authorized scope or role.
- [Competitor endorsement](/docs/red-team/plugins/competitors/#example-test-cases): Scenarios where AI might inadvertently promote competing products or services.

See [LLM vulnerability types](/docs/red-team/llm-vulnerability-types/) for more info.

## Red teaming is a core requirement of AI security

What's the point of it all? Red teaming is different from other AI security approaches because it provides a quantitative measure of risk _before_ deployment.

By running thousands of probes and evaluating the AI's performance, developers can make informed decisions about acceptable risk levels in offline testbeds. Many organizations build this into their development cycle and into processes like CI/CD.

This is an emerging field and new standards are emerging around the world, ranging from OWASP LLM Top 10 to NIST's AI Risk Management Framework and the EU AI Act. From what we've seen so far, most regulations/standards support a systematic benchmarking/red teaming process that quantifies risk via testing prior to deployment.

### Best practices for LLM red teaming

We recommend implementing a systematic process:

1. **Generate diverse adversarial inputs**: Create a wide range of inputs targeting various [vulnerability types](/docs/red-team/llm-vulnerability-types/).

2. **Set up routine evaluations**: Use an evaluation framework for LLMs to run these inputs through your system.

3. **Prioritize and address vulnerabilities**: Set a cadence for reviewing flagged outputs and determine priorities for both the red team and developers based on severity and impact.

Additional best practices to consider:

- **Define your pre-deployment vs post-deployment strategies**, typically with a focus on quantifying risk before changes are shipped to production.

- **Integrate red teaming into your development pipeline** to flag vulnerabilities early, meet developers where they are, and address issues before they reach production.

- **Focus on vulnerabilities for your specific application type**, e.g. [RAG](/docs/red-team/rag/), [LLM agents](/docs/red-team/agents/)

- Although industry frameworks are nascent, frameworks like [OWASP LLM Top 10](/docs/red-team/owasp-llm-top-10/) and NIST AI Risk Management Framework can be used as starting points.

## What's next?

To get started and run your first red team, see the [quickstart guide](/docs/red-team/quickstart/).
