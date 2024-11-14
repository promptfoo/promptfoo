---
sidebar_position: 2
sidebar_label: Quickstart
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Quickstart

Promptfoo is an [open-source](https://github.com/promptfoo/promptfoo) tool for red teaming gen AI applications.

- **Automatically scans 30+ vulnerability types**:
  - <a href="/docs/red-team/llm-vulnerability-types/#privacy-and-security" style={{background: '#f0f0f0', borderRadius: '4px', padding: '2px 4px', fontSize: '14px'}}>Security & data privacy</a>: jailbreaks, injections, RAG poisoning, etc.
  - <a href="/docs/red-team/llm-vulnerability-types/" style={{background: '#f0f0f0', borderRadius: '4px', padding: '2px 4px', fontSize: '14px'}}>Compliance & ethics</a>: harmful & biased content, content filter validation, OWASP/NIST/EU compliance, etc.
  - <a href="/docs/red-team/configuration/#custom-policies" style={{background: '#f0f0f0', borderRadius: '4px', padding: '2px 4px', fontSize: '14px'}}>Custom policies</a>: enforce organizational guidelines.
- Generates **dynamic attack probes** tailored to your application using specialized uncensored models.
- Implements state-of-the-art **adversarial ML research** from [Microsoft](/docs/red-team/strategies/multi-turn/), [Meta](/docs/red-team/strategies/goat/), and others.
- Integrates with [CI/CD](/docs/integrations/ci-cd/).
- Tests via [HTTP API](#attacking-an-api-endpoint), [browser](/docs/providers/browser/), or [direct model access](#alternative-test-specific-prompts-and-models).

<div style={{maxWidth: 460, margin: '0 auto'}}>
![llm red team report](/img/riskreport-1@2x.png)
</div>

## Prerequisites

- Install [Node 18 or later](https://nodejs.org/en/download/package-manager/)
- Optional but recommended: Set the `OPENAI_API_KEY` environment variable or [override the provider](/docs/red-team/configuration/#providers) with your preferred service.

## Initialize the project

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest redteam init my-project
      cd my-project
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    Install:
    <CodeBlock language="bash">
      npm install -g promptfoo
    </CodeBlock>

    Run:
    <CodeBlock language="bash">
      promptfoo redteam init my-project
      cd my-project
    </CodeBlock>

  </TabItem>
  <TabItem value="brew" label="brew">
    Install:
    <CodeBlock language="bash">
      brew install promptfoo
    </CodeBlock>

    Run:
    <CodeBlock language="bash">
      promptfoo redteam init my-project
      cd my-project
    </CodeBlock>

  </TabItem>
</Tabs>

The `init` command creates some placeholders, including a `promptfooconfig.yaml` file. We'll use this config file to do most of our setup.

## Attacking an API endpoint

Edit the config to set up the target endpoint. For example:

```yaml
targets:
  - id: 'https://example.com/generate'
    label: 'travel-agent-agent'
    config:
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'

purpose: 'The user is a budget traveler looking for the best deals. The system is a travel agent that helps the user plan their trip. The user is anonymous and should not be able to access any information about other users, employees, or other individuals.'
```

:::important
The `label` is used to create issues and report the results of the red teaming. Make sure to re-use the same `label` when generating new redteam configs for the same target.
:::

Setting the `purpose` is optional, but it will significantly improve the quality of the generated test cases and grading. Be specific about who the user of the system is and what information and actions they should be able to access.

For more information on configuring an HTTP target, see [HTTP requests](/docs/providers/http/).

### Alternative: Test specific prompts and models

If you don't have a live endpoint, you can edit the config to set the specific prompt(s) and the LLM(s) to test:

```yaml
prompts:
  - 'Act as a travel agent and help the user plan their trip. User query: {{query}}'
  # Paths to prompts also work:
  # - file://path/to/prompt.txt

targets:
  - id: openai:gpt-4o-mini
    label: 'travel-agent-mini'
```

For more information on supported targets, see [Custom Providers](/docs/red-team/configuration/#custom-providerstargets). For more information on supported prompt formats, see [prompts](/docs/configuration/parameters/#prompts).

### Alternative: Talking directly to your app

Promptfoo can hook directly into your existing LLM app to attack targets via Python, Javascript, RAG or agent workflows, HTTP API, and more. See [custom providers](/docs/red-team/configuration/#custom-providerstargets) for details on setting up:

- [HTTP requests](/docs/red-team/configuration/#http-requests) to your API
- [Custom Python scripts](/docs/red-team/configuration/#custom-scripts) for precise control
- [Javascript](/docs/providers/custom-api/), [any executable](/docs/providers/custom-script/), local providers like [ollama](/docs/providers/ollama/), or other [provider types](/docs/providers/)

## Run the eval

Now that we've generated the test cases, we're ready to run the adversarial evaluation.

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest redteam run
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo redteam run
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo redteam run
    </CodeBlock>
  </TabItem>
</Tabs>

This command will generate several hundred adversarial inputs across many categories of potential harm and save them in `redteam.yaml`. Then, it will run the test cases against the target.

## View the results

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest redteam report
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo redteam report
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo redteam report
    </CodeBlock>
  </TabItem>
</Tabs>

Promptfoo provides a report view that lets you dig into specific red team failure cases:

![llm red team report](/img/riskreport-1@2x.png)

That view includes a breakdown of specific test types that are connected to the eval view:

![llm red team remediations](/img/riskreport-2.png)

Clicking into a specific test case to view logs will display the raw inputs and outputs:

![llm red team evals](/img/docs/redteam-results.png)

### Understanding the report view

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
