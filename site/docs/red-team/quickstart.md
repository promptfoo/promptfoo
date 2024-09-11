---
sidebar_position: 2
sidebar_label: Quickstart
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Quickstart

This guide describes how to get started with Promptfoo's gen AI red teaming tool.

## Prerequisites

- Install [Node 18 or later](https://nodejs.org/en/download/package-manager/)
- Set the `OPENAI_API_KEY` environment variable or [override the provider](/docs/red-team/configuration/#providers) with your preferred service.

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

## Set the prompt & models to test

Edit the config to set up the prompt(s) and the LLM(s) you want to test:

```yaml
prompts:
  - 'Act as a travel agent and help the user plan their trip. User query: {{query}}'

providers:
  - openai:gpt-4o-mini
  - anthropic:messages:claude-3.5-sonnet-20240620
```

### Talking to your app

Promptfoo can hook directly into your existing LLM app (Python, Javascript, etc), RAG or agent workflows, or send requests to your API. See [custom providers](/docs/red-team/configuration/#custom-providers) for details on setting up:

- [HTTP requests](/docs/red-team/configuration/#http-requests) to your API
- [Custom Python scripts](/docs/red-team/configuration/#custom-scripts) for precise control
- [Javascript](/docs/providers/custom-api/), [any executable](/docs/providers/custom-script/), local providers like [ollama](/docs/providers/ollama/), or other [provider types](/docs/providers/)

### Prompting

Your prompt may be [dynamic](/docs/configuration/parameters/#prompt-functions), or maybe it's constructed entirely on the application side and you just want to [pass through](/docs/red-team/configuration/#passthrough-prompts) the adversarial input. Also note that files are accepted:

```yaml
prompts:
  - file://path/to/prompt.json
```

Learn more about [prompt formats](/docs/configuration/parameters/#prompts).

## Generate adversarial test cases

The `init` step will do this for you automatically, but in case you'd like to manually re-generate your adversarial inputs:

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest redteam generate
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo redteam generate
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo redteam generate
    </CodeBlock>
  </TabItem>
</Tabs>

This will generate several hundred adversarial inputs across many categories of potential harm and save them in `redteam.yaml`.

## Changing the provider (optional)

By default we use OpenAI's `gpt-4o` model to generate the adversarial inputs, but we support hundreds of other models. Learn more about [setting the provider](/docs/red-team/configuration/#providers).

## Run the eval

Now that we've generated the test cases, we're ready to run the adversarial evaluation.

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest eval -c redteam.yaml
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo eval -c redteam.yaml
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo eval -c redteam.yaml
    </CodeBlock>
  </TabItem>
</Tabs>

## View the results

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest view
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    <CodeBlock language="bash">
      promptfoo view
    </CodeBlock>
  </TabItem>
  <TabItem value="brew" label="brew">
    <CodeBlock language="bash">
      promptfoo view
    </CodeBlock>
  </TabItem>
</Tabs>

Promptfoo provides a detailed eval view that lets you dig into specific red team failure cases:

![llm red team evals](/img/docs/redteam-results.png)

Click "Vulnerability Report" in the top right corner to see the report view:

![llm red team report](/img/riskreport-1@2x.png)

That view includes a breakdown of specific test types that are connected to the eval view:

![llm red team remediations](/img/riskreport-2.png)

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
