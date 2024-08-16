---
sidebar_position: 1
sidebar_label: Intro
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

## How Promptfoo works

Promptfoo is an open-source tool for red teaming LLMs. It supports the red teaming process by:

1. Generating a diverse set of adversarial inputs
2. Running these inputs through your LLM application
3. Analyzing the outputs for potential vulnerabilities or undesirable behaviors
4. Providing actionable insights and suggested mitigations

Promptfoo red teaming can be used in two primary ways:

- **One-off runs**: Generate a comprehensive report that allows you to examine vulnerabilities and suggested mitigations.
- **CI/CD integration**: Continuously monitor for vulnerabilities in your deployment pipeline, ensuring ongoing safety as your application evolves.

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

## Quickstart

You can begin red teaming your application in less than 5 minutes.

### Prerequisites

- Install [Node 18 or later](https://nodejs.org/en/download/package-manager/)
- Set the `OPENAI_API_KEY` environment variable or [override the provider](#overriding-the-provider) with your preferred service.

### Initialize the project

```sh
npx promptfoo@latest redteam init my-project
cd my-project
```

The `init` command creates some placeholders, including a `promptfooconfig.yaml` file. We'll use this config file to do most of our setup.

### Set the prompt & models to test

Edit the config to set up the prompt(s) and the LLM(s) you want to test:

```yaml
prompts:
  - 'Act as a travel agent and help the user plan their trip. User query: {{query}}'

providers:
  - openai:gpt-4o-mini
  - anthropic:messages:claude-3.5-sonnet-20240620
```

#### Talking to your app

Promptfoo can hook directly into your existing LLM app (Python, Javascript, etc), RAG or agent workflows, or send requests to your API. See [custom providers](/docs/red-team/configuration/#custom-providers) for details on setting up:

- [HTTP requests](/docs/red-team/configuration/#http-requests) to your API
- [Custom Python scripts](/docs/red-team/configuration/#custom-scripts) for precise control
- [Javascript](/docs/providers/custom-api/), [any executable](/docs/providers/custom-script/), local providers like [ollama](/docs/providers/ollama/), or other [provider types](/docs/providers/)

#### Prompting

Your prompt may be [dynamic](/docs/configuration/parameters/#prompt-functions), or maybe it's constructed entirely on the application side and you just want to [pass through](/docs/red-team/configuration/#passthrough-prompts) the adversarial input. Also note that files are accepted:

```yaml
prompts:
  - file://path/to/prompt.json
```

Learn more about [prompt formats](/docs/configuration/parameters/#prompts).

### Generate adversarial test cases

The `init` step will do this for you automatically, but in case you'd like to manually re-generate your adversarial inputs:

```sh
npx promptfoo@latest generate redteam -w
```

This will generate several hundred adversarial inputs across many categories of potential harm.

You can reduce the number of test cases by setting the specific [plugins](/docs/guides/llm-redteaming#step-3-generate-adversarial-test-cases) you want to run. For example, to only generate harmful inputs:

```sh
npx promptfoo@latest generate redteam -w --plugins harmful
```

Run `npx promptfoo@latest generate redteam --help` to see all available plugins.

#### Changing the provider

By default we use OpenAI's `gpt-4o` model, but we support hundreds of other models. Learn more about [setting the provider](/docs/red-team/configuration/#providers).

### Run the eval

Now that we've generated the test cases, we're ready to run the adversarial evaluation.

```
npx promptfoo@latest eval
```

### View the results

```sh
npx promptfoo@latest view
```

Promptfoo provides a detailed eval view that lets you dig into specific red team failure cases:

![llm red team evals](/img/docs/redteam-results.png)

You also get a view that summarizes your LLM app's vulnerabilities:

![llm red team report](/img/riskreport-1@2x.png)

That view includes a breakdown of specific test types that are connected to the eval view:

![llm red team remediations](/img/riskreport-2.png)

## Understanding the report view

The red teaming results provide insights into various aspects of your LLM application's behavior:

1. **Vulnerability categories**: Identifies the types of vulnerabilities discovered, such as prompt injections, context poisoning, or unintended behaviors.
2. **Severity levels**: Classifies vulnerabilities based on their potential impact and likelihood of occurrence.
3. **Logs**: Provides concrete instances of inputs that triggered vulnerabilities.
4. **Suggested mitigations**: Recommendations for addressing identified vulnerabilities, which may include prompt engineering, additional safeguards, or architectural changes.

## Continuous improvement

Red teaming is not a one-time activity but an ongoing process. As you develop and refine your LLM application, regularly running red team evaluations helps ensure that:

1. New features or changes don't introduce unexpected vulnerabilities
2. Your application remains robust against evolving attack techniques
3. You can quantify and demonstrate improvements in safety and reliability over time

Check out the [CI/CD integration](/docs/integrations/ci-cd/) docs for more info.

## Resources

- [Configuration guide](/docs/red-team/configuration/) for detailed info on configuring your red team
- [Full guide](/docs/guides/llm-redteaming) for info examples of dynamically generated prompts, RAG/chain, etc.
- [Types of LLM vulnerabilities](/docs/red-team/llm-vulnerability-types/) for an overview of supported [plugins](/docs/category/plugins/)
- Guides on red teaming [agents](/docs/red-team/agents/) and [RAGs](/docs/red-team/rag/)
