# How to red team LLMs

Promptfoo is a popular open source evaluation framework that includes LLM red team and penetration testing capabilities.

This guide shows you how to automatically generate adversarial tests specifically for your app. The red team covers the following failure modes:

- Prompt injection ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/))
- Jailbreaking ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/))
- Excessive Agency ([OWASP LLM08](https://genai.owasp.org/llmrisk/llm08-excessive-agency/))
- Overreliance ([OWASP LLM09](https://genai.owasp.org/llmrisk/llm09-overreliance/))
- Hijacking (when the LLM is used for unintended purposes)
- Hallucination (when the LLM provides unfactual answers)
- Personally Identifiable Information (PII) leaks (ensuring the model does not inadvertently disclose PII)
- Safety risks from the [ML Commons Safety Working Group](https://arxiv.org/abs/2404.12241): violent crimes, non-violent crimes, sex crimes, child exploitation, specialized financial/legal/medical advice, privacy, intellectual property, indiscriminate weapons, hate, self-harm, sexual content.
- Safety risks from the [HarmBench](https://www.harmbench.org/) framework: Cybercrime & Unauthorized Intrusion, Chemical & Biological Weapons, Illegal Drugs, Copyright Violations, Misinformation & Disinformation, Harassment & Bullying, Illegal Activities, Graphic & age-restricted content, Promotion of unsafe practices, Privacy violations & data exploitation.

The end result is a view that displays red team test results and vulnerabilities:

![llm redteaming](/img/docs/redteam-results.png)

## Prerequisites

First, install [Node 18 or later](https://nodejs.org/en/download/package-manager/).

Then create a new project for your red teaming needs:

```sh
npx promptfoo@latest init my-redteam-project
cd my-redteam-project
```

The `init` command creates some placeholders, including a `promptfooconfig.yaml` file. This is where we’ll do most of our setup.

## Quickstart

Edit the config to set up the prompt and the LLM you want to test:

```yaml
prompts:
  - 'Act as a travel agent and help the user plan their trip. User query: {{query}}'

providers:
  - openai:gpt-3.5-turbo
```

Then create adversarial test cases:

```sh
npx promptfoo@latest generate redteam -w
```

Run the eval:

```sh
npx promptfoo@latest eval
```

And view the results:

```sh
npx promptfoo@latest view
```

Continue reading for more detailed information on each step, including how to point it to your app’s existing prompts, agent flow, and API.

## Step 1: Configure your prompts

The easiest way to get started is to edit `promptfooconfig.yaml` to include your prompt(s).

In this example, let's pretend we're building a trip planner app. I’ll set a prompt and include `{{variables}}` to indicate placeholders that will be replaced by user inputs:

```yaml
prompts:
  - 'Act as a travel agent and help the user plan their trip to {{destination}}.  Be friendly and concise. User query: {{query}}'
```

### Chat-style prompts

In most cases your prompt will be more complex, in which case you could create a `prompt.json`:

```yaml
[
  {
    'role': 'system',
    'content': 'Act as a travel agent and help the user plan their trip to {{destination}}.  Be friendly and concise.',
  },
  { 'role': 'user', 'content': '{{query}}' },
]
```

And then reference the file from `promptfooconfig.yaml`:

```yaml
prompts:
  - file://prompt.json
```

### Dynamically generated prompts

Some applications generate their prompts dynamically depending on variables. For example, suppose we want to determine the prompt based on the user's destination:

```python
def get_prompt(context):
  if context['vars']['destination'] === 'Australia':
    return f"Act as a travel agent, mate: {{query}}"

  return f"Act as a travel agent and help the user plan their trip.  Be friendly and concise. User query: {{query}}"

```

We can include this prompt in the configuration like so:

```yaml
prompts:
  - file://rag_agent.py:get_prompt
```

The equivalent Javascript is also supported:

```yaml
function getPrompt(context) {
  if (context.vars.destination === 'Australia') {
    return `Act as a travel agent, mate: ${context.query}`;
  }

  return `Act as a travel agent and help the user plan their trip. Be friendly and concise. User query: ${context.query}`;
}
```

## Step 2: Configure your LLM providers

LLMs are configured with the `providers` property in `promptfooconfig.yaml`. An LLM provider can be a known LLM API (such as OpenAI, Anthropic, Ollama, etc.) or a custom RAG or agent flow you've built yourself.

### LLM APIs

Promptfoo supports [many LLM providers](https://www.notion.so/docs/providers) including OpenAI, Anthropic, Mistral, Azure, Groq, Perplexity, Cohere, and more. In most cases all you need to do is set the appropriate API key environment variable.

You should choose at least one provider. If desired, set multiple in order to compare their performance in the red team eval. In this example, we’re comparing performance of GPT, Claude, and Llama:

```yaml
providers:
  - openai:gpt-4
  - anthropic:messages:claude-3-opus-20240229
  - ollama:chat:llama3:70b
```

To learn more, find your preferred LLM provider [here](/docs/providers).

### Custom flows

If you have a custom RAG or agent flow, you can include them in your project like this:

```yaml
providers:
  # JS is natively supported
  - file:///path/to/js_agent.js
  # Python requires the `python:` directive
  - python:/path/to/python_agent.py
  # Any executable can be run with the `exec:` directive
  - exec:/path/to/shell_agent
  # HTTP requests can be made with the `webhook:` directive
  - webhook:<http://localhost:8000/api/agent>
```

To learn more, see:

- [Javascript provider](https://www.notion.so/docs/providers/custom-api)
- [Python provider](https://www.notion.so/docs/providers/python)
- [Exec provider](https://www.notion.so/docs/providers/custom-script) (Used to run any executable from any programming language)
- [Webhook provider](https://www.notion.so/docs/providers/webhook) (HTTP requests, useful for testing an app that is online or running locally)

### HTTP endpoints

In order to pentest a live API endpoint, set the provider id to a URL. This will send an HTTP request to the endpoint. It expects that the LLM or agent output will be in the HTTP response.

```yaml
providers:
  - id: 'https://example.com/generate'
    config:
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        my_prompt: '{{prompt}}'
      responseParser: 'json.path[0].to.output'
```

Customize the HTTP request using a placeholder variable `{{prompt}}` that will be replaced by the final prompt during the pentest.

If your API responds with a JSON object and you want to pick out a specific value, use the `responseParser` key to set a Javascript snippet that manipulates the provided `json` object.

For example, `json.nested.output` will reference the output in the following API response:

```yaml
{ 'nested': { 'output': '...' } }
```

You can also reference nested objects. For example, `json.choices[0].message.content` references the generated text in a standard OpenAI chat response.

### Configuring the grader

The results of the red team are graded by a model. By default, `gpt-4o` is used and the test expects an `OPENAI_API_KEY` environment variable.

You can override the grader by adding a provider override for `defaultTest`, which will apply the override to all test cases. Here’s an example of using Llama3 as a grader locally:

```yaml
defaultTest:
  options:
    provider: 'ollama:chat:llama3:70b'
```

And in this example, we use [Azure OpenAI](/docs/providers/azure/#model-graded-tests) as a grader:

```yaml
defaultTest:
  options:
    provider:
      id: azureopenai:chat:gpt-4-deployment-name
      config:
        apiHost: 'xxxxxxx.openai.azure.com'
```

For more information, see [Overriding the LLM grader](/docs/configuration/expected-outputs/model-graded/#overriding-the-llm-grader).

## Step 3: Generate adversarial test cases

Now that you've configured everything, the next step is to generate the red teaming inputs. This is done by running the `promptfoo generate redteam` command:

```sh
npx promptfoo@latest generate redteam -w
```

This command works by reading your prompts and providers, and then generating a set of adversarial inputs that stress-test your prompts/models in a variety of situations. Test generation usually takes about 5 minutes.

The adversarial tests include:

- Prompt injection ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/))
- Jailbreaking ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/))
- Excessive Agency ([OWASP LLM08](https://genai.owasp.org/llmrisk/llm08-excessive-agency/))
- Overreliance ([OWASP LLM09](https://genai.owasp.org/llmrisk/llm09-overreliance/))
- Hallucination (when the LLM provides unfactual answers)
- Hijacking (when the LLM is used for unintended purposes)
- PII leaks (ensuring the model does not inadvertently disclose PII)

It also tests for a variety of harmful input and output scenarios from the [ML Commons Safety Working Group](https://arxiv.org/abs/2404.12241) and [HarmBench](https://www.harmbench.org/) framework:

<details>
<summary>View harmful categories</summary>

- Chemical & biological weapons
- Child exploitation
- Copyright violations
- Cybercrime & unauthorized intrusion
- Graphic & age-restricted content
- Harassment & bullying
- Hate
- Illegal activities
- Illegal drugs
- Indiscriminate weapons
- Intellectual property
- Misinformation & disinformation
- Non-violent crimes
- Privacy
- Privacy violations & data exploitation
- Promotion of unsafe practices
- Self-harm
- Sex crimes
- Sexual content
- Specialized financial/legal/medical advice
- Violent crimes

</details>

By default, all of the above will be included in the redteam. To use specific types of tests, use `--plugins`:

```yaml
npx promptfoo@latest generate redteam -w --plugins 'harmful,jailbreak,hijacking'
```

The following plugins are supported:

| Plugin Name      | Description                                                                  |
| ---------------- | ---------------------------------------------------------------------------- |
| excessive-agency | Tests if the model exhibits too much autonomy or makes decisions on its own. |
| hallucination    | Tests if the model generates false or misleading content.                    |
| harmful          | Tests for the generation of harmful or offensive content.                    |
| hijacking        | Tests the model's vulnerability to being used for unintended tasks.          |
| jailbreak        | Tests if the model can be manipulated to bypass its safety mechanisms.       |
| overreliance     | Tests for excessive trust in LLM output without oversight.                   |
| pii              | Tests for inadvertent disclosure of personally identifiable information.     |
| prompt-injection | Tests the model's susceptibility to prompt injection attacks.                |

The adversarial test cases will be written to `promptfooconfig.yaml`.

## Step 4: Run the pentest

Now that all the red team tests are ready, run the eval:

```sh
npx promptfoo@latest eval
```

This will take a while, usually ~15 minutes or so depending on how many plugins you have chosen.

## Step 5: Review results

Use the web viewer to review the flagged outputs and understand the failure cases.

```sh
npx promptfoo@latest view
```

This will open a view that displays red team test results lets you dig into specific vulnerabilities:

![llm redteaming](/img/docs/redteam-results.png)
