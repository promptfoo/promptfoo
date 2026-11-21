---
sidebar_position: 2
sidebar_label: Getting started
description: Start red teaming LLMs in minutes by scanning 50+ vulnerabilities including jailbreaks, prompt injection, and data exfiltration
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import styles from '@site/src/pages/quickstart.module.css';

# Getting started

Promptfoo is an [open-source](https://github.com/promptfoo/promptfoo) tool for red teaming gen AI applications.

- **Automatically scans 50+ vulnerability types**:
  - <a href="/docs/red-team/llm-vulnerability-types/#privacy-and-security" className={styles.badge}>Security & data privacy</a>: jailbreaks, injections, RAG poisoning, etc.
  - <a href="/docs/red-team/llm-vulnerability-types/" className={styles.badge}>Compliance & ethics</a>: harmful & biased content, content filter validation, OWASP/NIST/EU compliance, etc.
  - <a href="/docs/red-team/configuration/#custom-policies" className={styles.badge}>Custom policies</a>: enforce organizational guidelines.
- Generates **dynamic attack probes** tailored to your application using specialized uncensored models.
- Includes **adversarial ML techniques** from [Microsoft](/docs/red-team/strategies/multi-turn/), [Meta](/docs/red-team/strategies/goat/), and others.
- Integrates with [CI/CD](/docs/integrations/ci-cd/).
- Tests via [HTTP API](#attacking-an-api-endpoint), [browser](/docs/providers/browser/), or [direct model access](#alternative-test-specific-prompts-and-models).

<div className={styles.imageContainer}>
  ![llm red team report](/img/riskreport-1@2x.png)
</div>

## Prerequisites

Install a [supported Node.js version](/docs/installation#nodejs-runtime-support). You don't need a model API key to set up a scan. If the app or model you're testing requires credentials, you'll need them to run it.

## Initialize the project

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    ```bash
    npx promptfoo@latest redteam setup
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    Install:
    ```bash
    npm install -g promptfoo
    ```

    Run:
    ```bash
    promptfoo redteam setup
    ```

  </TabItem>
  <TabItem value="brew" label="brew">
    Install:
    ```bash
    brew install promptfoo
    ```

    Run:
    ```bash
    promptfoo redteam setup
    ```

  </TabItem>
</Tabs>

The command opens red team setup in your browser. For a new scan, start with the setup agent. If you already have a draft, you can keep editing it.

### Provide application details

Tell the agent what your app does and what you want to catch. Here's an example for a support bot.

> Our bot looks up orders and issues refunds. A customer should never see someone else's order or get a refund without approval.

Select **Draft test plan**. Your answers go to Promptfoo Cloud, so leave out secrets and real customer records. Drafting doesn't contact your target.

The plan starts with three direct tests for each of up to four risks. Uncheck any risks you want to skip or ask the agent to adjust the plan. Select **Use plan &amp; connect app** when you're ready.

No app yet? Select **Try the demo app**, then **Draft test plan**. **Review demo setup** takes you straight to [review and save](#review-and-save) with Promptfoo's example support bot as the target.

To skip the agent, select **Set up manually**. You can also load a saved configuration or import YAML.

### Configure the target

You can test endpoints reachable from your machine, including localhost. Only test systems you have permission to scan.

- **HTTP endpoint** is selected by default. Select **Configure target**, enter your URL, and adjust the request body and response parser to match your app. See the [HTTP example](#attacking-an-api-endpoint).
- For a **model or another connection type**, select **Change target type**. Choose a provider and enter the model or deployment ID. See [common target types](#common-target-types).

Testing the connection sends a request to your app and can share the target configuration and response with Cloud. [Learn what data leaves your machine](/docs/red-team/troubleshooting/data-handling/).

With the agent, select **Review setup** to [review and save](#review-and-save). In manual setup, enter your app's purpose in **Application Details**, then select plugins and strategies.

### Select plugins

[Plugins](/docs/red-team/plugins/) determine which risks to test, such as unauthorized access to another customer's orders.

For manual setup, choose individual plugins or start with the **Default** preset.

### Select attack strategies

[Strategies](/docs/red-team/strategies/) determine how to attack your app, for example by disguising a request to bypass a safety check.

### Review and save

Check the target and estimated number of requests. To change the test count in the agent's plan, select **Adjust test settings**. For broader coverage, add plugins or attack strategies.

**Save YAML** downloads `promptfooconfig.yaml` without starting a scan. To run it from the browser, select **Run Now**. Promptfoo may ask you to verify your email before the first scan.

:::info
For manual setup in the terminal, run the following command.

```sh
promptfoo redteam init --no-gui
```

For a new Google Vertex AI target, the CLI offers `vertex:gemini-3.1-pro-preview` and writes
`region: global` for it. Existing configurations can still be imported with their saved model IDs.

:::

## Run the scan

If you downloaded the config, run the following command in the same directory as `promptfooconfig.yaml`.

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    ```bash
    npx promptfoo@latest redteam run
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo redteam run
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo redteam run
    ```
  </TabItem>
</Tabs>

Promptfoo generates the test cases in `redteam.yaml`, sends them to your target, and grades the responses. Attack generation uses a [separate provider](/docs/red-team/configuration/#providers). Promptfoo supports hosted generation and grading if you don't have a model API key.

![llm red team run](/img/docs/redteam-run.png)

## View the results

<Tabs groupId="installation-method">
  <TabItem value="npx" label="npx" default>
    ```bash
    npx promptfoo@latest redteam report
    ```
  </TabItem>
  <TabItem value="npm" label="npm">
    ```bash
    promptfoo redteam report
    ```
  </TabItem>
  <TabItem value="brew" label="brew">
    ```bash
    promptfoo redteam report
    ```
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
    label: 'travel-agent'
    config:
      url: 'https://example.com/generate'
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'

purpose: 'The user is a budget traveler looking for the best deals. The system is a travel agent that helps the user plan their trip. The user is anonymous and should not be able to access any information about other users, employees, or other individuals.'
```

The `label` is used to create issues and report the results of the red teaming. Make sure to re-use the same `label` when generating new red team configs for the same target.

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
  - id: openai:gpt-5-mini
    label: 'travel-agent-mini'
```

Promptfoo supports dozens of model providers. To configure your own application as the target, see [custom targets](/docs/red-team/configuration/#custom-providerstargets). For more information on supported prompt formats, see [prompts](/docs/configuration/prompts).

For llamafile, vLLM, and Text Generation WebUI, keep the `openai:chat:` prefix, enter the server's model name, and set `apiBaseUrl` including `/v1`. If your server requires authentication, set `apiKeyEnvar` to the name of an environment variable on the machine running Promptfoo. The native [llama.cpp provider](/docs/providers/llama.cpp/) uses `llama:` and reads its server URL from `LLAMA_BASE_URL` on the machine running Promptfoo.

### Alternative: Talking directly to your app

Promptfoo hooks directly into your existing LLM app to attack targets via Python, Javascript, RAG or agent workflows, HTTP API, and more. See [custom targets](/docs/red-team/configuration/#custom-providerstargets) for details on connecting:

- [HTTP requests](/docs/red-team/configuration/#http-requests) to your API
- [Custom Python scripts](/docs/red-team/configuration/#custom-scripts) for precise control
- [Javascript](/docs/providers/custom-api/), [any executable](/docs/providers/custom-script/), local providers like [ollama](/docs/providers/ollama/), or other [provider types](/docs/providers/)

## Continuous improvement

Rerun red team tests after changes to prompts, models, tools, or guardrails. Compare failures and attack success rates with previous runs to identify regressions. See [CI/CD integration](/docs/integrations/ci-cd/).

## Resources

- [Configuration guide](/docs/red-team/configuration/) for detailed info on configuring your red team
- [Full guide](/docs/guides/llm-redteaming) for info examples of dynamically generated prompts, RAG/chain, etc.
- [Types of LLM vulnerabilities](/docs/red-team/llm-vulnerability-types/) for an overview of supported [plugins](/docs/red-team/plugins/)
- Guides on red teaming [agents](/docs/red-team/agents/) and [RAGs](/docs/red-team/rag/)
