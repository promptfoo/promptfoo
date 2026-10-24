---
sidebar_position: 2
sidebar_label: Getting started
description: Configure an application target, choose red team plugins and attack strategies, run a scan, and inspect the responses and grading reasons behind failed tests.
---

import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import styles from '@site/src/pages/quickstart.module.css';

# Getting started

This guide takes you from configuring a target to inspecting a red team result. Promptfoo generates attacks based on your application's purpose, sends them to the target, and grades the responses against the selected plugins' criteria.

You can test an [HTTP API](#attacking-an-api-endpoint), a [browser application](/docs/providers/browser/), or a [model directly](#alternative-test-specific-prompts-and-models).

<div className={styles.imageContainer}>
  ![llm red team report](/img/riskreport-1@2x.png)
</div>

## Prerequisites

- Install [Node.js](https://nodejs.org/en/download/package-manager/) `>=22.22.0`
- A reachable target and any credentials needed to call it
- Credentials for any generation or grading providers you configure. See [provider configuration](/docs/red-team/configuration/#providers) and [remote generation](/docs/red-team/troubleshooting/remote-generation) for the available paths.

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

Provider cards populate an editable target ID and configuration. Choose a hosted model available to your account, or enter your own deployment, served model, or Bedrock agent and alias IDs.

For llamafile, vLLM, and Text Generation WebUI, keep the `openai:chat:` prefix, enter the server's model name, and set `apiBaseUrl` including `/v1`. If your server requires authentication, set `apiKeyEnvar` to the name of an environment variable on the machine running Promptfoo. The native [llama.cpp provider](/docs/providers/llama.cpp/) uses `llama:` and reads its server URL from `LLAMA_BASE_URL` on the machine running Promptfoo.

:::note
The target defines the model being tested. Attack generation uses a separate provider (defaults to OpenAI). See [Providers](/docs/red-team/configuration/#providers) to configure a custom attack model.
:::

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

This command generates test cases in `redteam.yaml` and runs them against the target. The number and type of attacks depend on your selected plugins, strategies, and test counts.

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

Start with a failed test and read the attack input, target response, and grading reason together. Check whether the response violates the application's stated purpose. If the grader misunderstood the application's permissions or expected behavior, [correct its context](/docs/red-team/troubleshooting/false-positives) before interpreting the result.

Use the vulnerability categories and [risk scores](/docs/red-team/risk-scoring) to prioritize review. Investigate execution errors separately. A passing test means the configured check did not find a violation in that response, not that untested behavior is secure.

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

### Alternative: Talking directly to your app

Promptfoo hooks directly into your existing LLM app to attack targets via Python, Javascript, RAG or agent workflows, HTTP API, and more. See [custom targets](/docs/red-team/configuration/#custom-providerstargets) for details on connecting:

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
