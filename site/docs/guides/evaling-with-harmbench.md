---
sidebar_label: Evaluating LLM safety with HarmBench
description: Assess LLM vulnerabilities against 400 HarmBench behaviors to identify and prevent harmful outputs across 7 risk categories
---

# Evaluating LLM safety with HarmBench

[HarmBench](https://arxiv.org/abs/2402.04249) is an automated red teaming benchmark created by researchers at UC Berkeley, Google DeepMind, and the Center for AI Safety. It includes 400 harmful behaviors across categories such as:

- Chemical and biological threats (e.g., dangerous substances, weapons)
- Illegal activities (e.g., theft, fraud, trafficking)
- Misinformation and conspiracy theories
- Harassment and hate speech
- Cybercrime (e.g., malware, system exploitation)
- Copyright violations

Run HarmBench against a model or an application endpoint to test the configured prompts, guardrails, and processing layers. The report shows which tested behaviors produced failures.
![harmbench evaluation results](/img/docs/harmbench-results.png)

## Configure the evaluation

Create a new configuration file `promptfooconfig.yaml`:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: HarmBench evaluation of OpenAI GPT-5-mini
targets:
  - id: openai:gpt-5-mini
    label: OpenAI GPT-5-mini
redteam:
  plugins:
    - id: harmbench
      numTests: 400
```

To focus on a smaller slice of the benchmark, filter by category:

```yaml
redteam:
  plugins:
    - id: harmbench
      numTests: 50
      config:
        categories:
          - cybercrime
          - misinformation
        functionalCategories:
          - contextual
```

The semantic categories are `chemical_biological`, `copyright`, `cybercrime_intrusion`, `harassment_bullying`, `harmful`, `illegal`, and `misinformation_disinformation`. The functional categories are `standard`, `contextual`, and `copyright`. When you set both filters, Promptfoo uses their intersection.

## Run the evaluation

In the same folder where you defined `promptfooconfig.yaml`, execute the HarmBench evaluation.

```bash
npx promptfoo@latest redteam run
```

Once you're done, view the results:

```bash
npx promptfoo@latest view
```

You can see an example of the results below as well as the full results of a sample evaluation [here](https://www.promptfoo.app/eval/eval-m9D-2025-01-30T17:29:53). In the example we highlighted above, we're doing a comparative analysis of our internal sample application (powered by `gpt-5-mini`) against the vanilla version of `gpt-5-mini` from OpenAI.

By providing some additional context to OpenAI (from our application), you can observe how our internal application is able to resist attacks that the vanilla model is not able to. You can also filter by failures by selecting `Show failures only` on the display dropdown at the top left.

## Testing different targets

Promptfoo has built-in support for a wide variety of models such as those from OpenAI, Anthropic, Hugging Face, Deepseek, Ollama and more.

### Ollama Models

First, start your Ollama server and pull the model you want to test:

```bash
ollama pull llama4:scout
```

Then configure Promptfoo to use it:

```yaml
targets:
  - ollama:chat:llama4:scout
```

### Your application

To target an application instead of a model, use the [HTTP Provider](/docs/providers/http/), [Javascript Provider](/docs/providers/custom-api/), or [Python Provider](/docs/providers/python/).

For example, if you have a local API endpoint that you want to test, you can use the following configuration:

```yaml
targets:
  - id: https
    config:
      url: 'https://example.com/generate'
      method: 'POST'
      headers:
        'Content-Type': 'application/json'
      body:
        myPrompt: '{{prompt}}'
```

## Conclusion and Next Steps

HarmBench uses a static dataset. Add plugins for application-specific risks such as PII leaks or excessive agency to test behavior outside the benchmark.

For more information, see:

- [HarmBench paper](https://arxiv.org/abs/2402.04249)
- [HarmBench GitHub repository](https://github.com/centerforaisafety/HarmBench)
- [HarmBench Promptfoo plugin](/docs/red-team/plugins/harmbench)
- [Promptfoo red teaming guide](/docs/red-team/quickstart)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)
- [CybersecEval](/blog/cyberseceval)
