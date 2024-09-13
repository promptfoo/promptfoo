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

In order to do this, we need to systematically generate a wide range of adversarial inputs and evaluate the LLM's responses. This process is known as "red teaming".

By systematically probing the LLM application, you can produce a report that quantifies the risk of misuse and provides suggestions for mitigation.

:::tip
Ready to run a red team? Jump to **[Quickstart](/docs/red-team/quickstart/)**.
:::

![llm red team report](/img/riskreport-1@2x.png)

## Red teaming is a core requirement of AI security

Red teaming is different from other AI security approaches because it provides a quantitative measure of risk _before_ deployment.

By running thousands of probes and evaluating the AI's performance, developers can make informed decisions about acceptable risk levels in offline testbeds. Many organizations build this into their development cycle and into processes like CI/CD.

This is an emerging field and new standards are emerging around the world, ranging from [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) to [NIST's AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) and the [EU AI Act](https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation-on-artificial-intelligence).

From what we've seen so far, most regulations/standards support a systematic benchmarking/red teaming process that quantifies risk via testing prior to deployment.

## How LLM red teaming works

The process of red teaming LLMs generally requires some degree of automation for a comprehensive evaluation. This is because LLMs have such a wide attack surface and are stochastic in nature (i.e. they are not consistent from one generation to the next).

A systematic approach looks like this:

1. Generate a diverse set of adversarial inputs
2. Run these inputs through your LLM application
3. Analyze the outputs for vulnerabilities or undesirable behaviors

Once a process is set up, it can be applied in two primary ways:

- **One-off runs**: Generate a comprehensive report that allows you to examine vulnerabilities and suggested mitigations.
- **CI/CD integration**: Continuously monitor for vulnerabilities in your deployment pipeline, ensuring ongoing safety as your application evolves.

The magic moment for managing AI risk usually comes after an organization is able to set up some continuous measurement of AI risk: whether through CI/CD, internal requirements, or some other form of scheduled runs.

![llm security continuous monitoring](/img/continuous-monitoring.png)

## Model vs application layer threats

In general, threats fall into two main categories: model ("foundation") or application layer. While there is some overlap, it helps to be explicit in your red teaming goals which side you want to test.

When research labs like OpenAI or Anthropic train a new model, they have internal (and external) testers stress-test the chat-tuned model for safety and research purposes. Model-layer vulnerabilities include things like ability to produce:

- Prompt injections and jailbreaks
- Hate speech, bias, toxicity, and other harmful outputs
- Hallucinations
- Copyright violations
- Specialized advice (medical, financial)
- Results that exhibit excessive agency or exploit overreliance
- PII leaks (from training data)

On the other hand, there are classes of vulnerabilities that only manifest once you've connected the model to a larger application environment. These include:

- Indirect prompt injections
- PII leaks (from context, e.g. in RAG architectures)
- Tool-based vulnerabilities (e.g. unauthorized data access, privilege escalations, SQL injections - depending on API and database access)
- Hijacking (aka off-topic use)
- Data/chat exfiltration techniques (e.g. markdown images, link unfurling)

Most applications do not require their own models, but rather integrate existing models into applications. For this reason, application layer threats are often the focus of red teaming efforts for LLM-based software, as they are likely to cause the greatest technical risks.

## White box vs black box testing

White box testing of LLMs involves having full access to the model's architecture, training data, and internal weights. This enables highly effective attack algorithms like [greedy coordinate descent](https://github.com/llm-attacks/llm-attacks) and [AutoDAN](https://arxiv.org/abs/2310.04451).

The downside of these white box attacks is that they tend to be slow and are adapted to specific characteristics of the model. Additionally, most developers are not building with models that are exposed via their weights, so this approach is not practical for most use cases.

On the other hand, black box testing treats the LLM as a closed system, where only inputs and outputs are observable. This approach simulates real-world scenarios where attackers don't have insider knowledge.

Both methods have their merits in red teaming:

- White box testing can uncover deeper, structural vulnerabilities.
- Black box testing is more representative of real-world attack scenarios and can reveal unexpected behaviors.

For most developers and AppSec teams, black box testing is the more practical approach, because in most cases testers do not have access to model internals. A black-box approach more easily incorporates the real world infrastructure associated with RAGs and agents.

![llm testing: white-box vs black-box](/img/docs/llm-testing-diagram.svg)

## Examples

Promptfoo is an open-source tool for red teaming LLMs that supports all the above. It can generate a wide range of adversarial inputs to test various vulnerabilities:

- [Harmful content](/docs/red-team/plugins/harmful/#examples): Examples of hate speech, offensive content, and other harmful outputs triggered in leading AI models.
- [Broken object-level authorization (BOLA)](/docs/red-team/plugins/bola/#example-test-cases): Test cases for unauthorized access to resources belonging to other users.
- [Broken function-level authorization (BFLA)](/docs/red-team/plugins/bfla/#how-it-works): Prompts attempting to perform actions beyond authorized scope or role.
- [Competitor endorsement](/docs/red-team/plugins/competitors/#example-test-cases): Scenarios where AI might inadvertently promote competing products or services.

See [LLM vulnerability types](/docs/red-team/llm-vulnerability-types/) for more info on model and application vulnerabilities.

## Best practices

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
