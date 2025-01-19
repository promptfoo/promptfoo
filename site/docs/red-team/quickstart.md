---
sidebar_position: 2
sidebar_label: Quickstart
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import styles from '@site/src/pages/quickstart.module.css';

# Quickstart

Promptfoo is an [open-source](https://github.com/promptfoo/promptfoo) tool for red teaming gen AI applications.

- **Automatically scans 50+ vulnerability types**:
  - <a href="/docs/red-team/llm-vulnerability-types/#privacy-and-security" className={styles.badge}>Security & data privacy</a>: jailbreaks, injections, RAG poisoning, etc.
  - <a href="/docs/red-team/llm-vulnerability-types/" className={styles.badge}>Compliance & ethics</a>: harmful & biased content, content filter validation, OWASP/NIST/EU compliance, etc.
  - <a href="/docs/red-team/configuration/#custom-policies" className={styles.badge}>Custom policies</a>: enforce organizational guidelines.
- Generates **dynamic attack probes** tailored to your application using specialized uncensored models.
- Implements state-of-the-art **adversarial ML research** from [Microsoft](/docs/red-team/strategies/multi-turn/), [Meta](/docs/red-team/strategies/goat/), and others.
- Integrates with [CI/CD](/docs/integrations/ci-cd/).
- Tests via [HTTP API](#attacking-an-api-endpoint), [browser](/docs/providers/browser/), or [direct model access](#alternative-test-specific-prompts-and-models).

<div className={styles.imageContainer}>
  ![llm red team report](/img/riskreport-1@2x.png)
</div>

## Prerequisites

- Install [Node 18 or later](https://nodejs.org/en/download/package-manager/)
- Optional: Set your `OPENAI_API_KEY` environment variable

## Initialize the project

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    <CodeBlock language="bash">
      npx promptfoo@latest redteam setup
    </CodeBlock>
  </TabItem>
  <TabItem value="npm" label="npm">
    Install:
    <CodeBlock language="bash">
      npm install -g promptfoo
    </CodeBlock>

    Run:
    <CodeBlock language="bash">
      promptfoo redteam setup
    </CodeBlock>

  </TabItem>
  <TabItem value="brew" label="brew">
    Install:
    <CodeBlock language="bash">
      brew install promptfoo
    </CodeBlock>

    Run:
    <CodeBlock language="bash">
      promptfoo redteam setup
    </CodeBlock>

  </TabItem>
</Tabs>

The `setup` command will open a web UI that asks questions to help you configure your red teaming project.

### Provide application details

Start by providing some details about the target application. The more details we provide, the more tailored the generated test cases will be.

At a minimum, be sure to fill out the **Purpose** field with a description of your application.

:::tip
If you just want to try out a quick example, click "Load Example" at the top of the Application Details page.
:::

![llm red team setup](/img/docs/setup/application-details.png)

---

### Configure the target

Next, configure Promptfoo to communicate with your target application or model.

Because the Promptfoo scanner runs locally on your machine, it can attack any endpoint accessible from your machine or network.

[See below](#alternative-test-specific-prompts-and-models) for more info on how to talk with non-HTTP targets such as models (local or remote) or custom code.

![llm red team setup](/img/docs/setup/target.png)

### Select plugins

Next, select the plugins that you want to use. [Plugins](/docs/red-team/plugins/) are adversarial generators. They produce malicious inputs that are sent to your application.

Check off the individual plugins you want to use, or select a preset that includes a combination of plugins (if in doubt, stick with "Default").

![llm red team setup](/img/docs/setup/plugins.png)

### Select attack strategies

Now we select strategies. [Strategies](/docs/red-team/strategies/) are techniques that wrap the generated inputs in a specific attack pattern.

This is how Promptfoo generates more sophisticated jailbreaks and injections.

![llm red team setup](/img/docs/setup/strategy.png)

### Review and save

Finally, download the generated configuration file. You'll use this to run the red team from your local machine.

![llm red team setup](/img/docs/setup/review.png)

Save the file as `promptfooconfig.yaml`. Then, navigate to the directory where you saved the file and run `promptfoo redteam run`.

:::info
If you don't want to use the UI to start a red team, you can use the `init` command instead:

```sh
promptfoo redteam init --no-gui
```

:::

## Run the scan

Now that we've generated the test cases, we're ready to run the adversarial evaluation.

Run this command in the same directory as your `promptfooconfig.yaml` file:

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

![llm red team run](/img/docs/redteam-run.png)

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

## Common target types

### Attacking an API endpoint

The configuration file includes a description of the target endpoint. You can edit the config to make changes to the target. For example:

```yaml
targets:
  - id: https
    label: 'travel-agent-agent'
    config:
      url: 'https://example.com/generate'
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'

purpose: 'The user is a budget traveler looking for the best deals. The system is a travel agent that helps the user plan their trip. The user is anonymous and should not be able to access any information about other users, employees, or other individuals.'
```

The `label` is used to create issues and report the results of the red teaming. Make sure to re-use the same `label` when generating new redteam configs for the same target.

Setting the `purpose` is optional, but it will significantly improve the quality of the generated test cases and grading. Be specific about who the user of the system is and what information and actions they should be able to access.

:::info
For more information on configuring an HTTP target, see [HTTP requests](/docs/providers/http/).
:::

### Alternative: Test specific prompts and models

If you don't have a live endpoint, you can edit the config to set the specific prompt(s) and the LLM model(s) to test:

```yaml
prompts:
  - 'Act as a travel agent and help the user plan their trip. User query: {{query}}'
  # Paths to prompts also work:
  # - file://path/to/prompt.txt

targets:
  - id: openai:gpt-4o-mini
    label: 'travel-agent-mini'
```

Promptfoo supports dozens of model providers. For more information on supported targets, see [Custom Providers](/docs/red-team/configuration/#custom-providerstargets). For more information on supported prompt formats, see [prompts](/docs/configuration/parameters/#prompts).

### Alternative: Talking directly to your app

Promptfoo hooks directly into your existing LLM app to attack targets via Python, Javascript, RAG or agent workflows, HTTP API, and more. See [custom providers](/docs/red-team/configuration/#custom-providerstargets) for details on setting up:

- [HTTP requests](/docs/red-team/configuration/#http-requests) to your API
- [Custom Python scripts](/docs/red-team/configuration/#custom-scripts) for precise control
- [Javascript](/docs/providers/custom-api/), [any executable](/docs/providers/custom-script/), local providers like [ollama](/docs/providers/ollama/), or other [provider types](/docs/providers/)

## Continuous improvement

Red teaming is not a one-time activity but an ongoing process. As you develop and refine your LLM application, regularly running red team evaluations helps ensure that:

1. New features or changes don't introduce unexpected vulnerabilities
2. Your application remains robust against evolving attack techniques
3. You can quantify and demonstrate improvements in safety and reliability over time

Check out the [CI/CD integration](/docs/integrations/ci-cd/) docs for more info.

## Resources

- [Configuration guide](/docs/red-team/configuration/) for detailed info on configuring your red team
- [Full guide](/docs/guides/llm-redteaming) for info examples of dynamically generated prompts, RAG/chain, etc.
- [Types of LLM vulnerabilities](/docs/red-team/llm-vulnerability-types/) for an overview of supported [plugins](/docs/red-team/plugins/)
- Guides on red teaming [agents](/docs/red-team/agents/) and [RAGs](/docs/red-team/rag/)
