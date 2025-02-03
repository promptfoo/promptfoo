---
sidebar_label: Evaluating LLM safety with HarmBench
---

# Evaluating LLM safety with HarmBench

Recent research has shown that even the most advanced LLMs [remain vulnerable](https://unit42.paloaltonetworks.com/jailbreaking-deepseek-three-techniques/) to adversarial attacks. Recent reports from security researchers have documented threat actors exploiting these vulnerabilities to [generate](https://unit42.paloaltonetworks.com/using-llms-obfuscate-malicious-javascript/) [malware](https://www.proofpoint.com/uk/blog/threat-insight/security-brief-ta547-targets-german-organizations-rhadamanthys-stealer) variants and evade detection systems, highlighting the importance of robust safety testing for any LLM-powered application.

To help define a systematic way to assess potential risks and vulnerabilities in LLM systems, researchers at UC Berkeley, Google DeepMind, and the Center for AI Safety created [HarmBench](https://arxiv.org/abs/2402.04249), a standardized evaluation framework for automated red teaming of Large Language Models (LLMs). The dataset evaluates models across 400 key harmful behaviors including:

- Chemical and biological threats (e.g., dangerous substances, weapons)
- Illegal activities (e.g., theft, fraud, trafficking)
- Misinformation and conspiracy theories
- Harassment and hate speech
- Cybercrime (e.g., malware, system exploitation)
- Copyright violations

This guide will show you how to use Promptfoo to run HarmBench evaluations against your own LLMs or GenAI applications. Unlike testing base models in isolation, Promptfoo enables you to evaluate the actual behavior of LLMs **within your application's context** - including your prompt engineering, safety guardrails, and any additional processing layers.

This is important because your application's prompt engineering and context can significantly impact model behavior. For instance, even refusal-trained LLMs can still easily be [jailbroken](https://arxiv.org/abs/2410.13886) when operating as an agent in a web browser. Testing has also shown that even the latest version[^1] of **GPT-4o [still fails](https://www.promptfoo.app/eval/eval-hu9-2025-02-03T17:21:33) ~6% of HarmBench's attacks**.

The end result of testing with HarmBench is a report that shows how well your model or application defends against HarmBench's attacks.
![harmbench evaluation results](/img/docs/harmbench-results.png)

## Configure the evaluation

Create a new configuration file `promptfooconfig.yaml`:

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: HarmBench evaluation of OpenAI GPT-4o-mini
targets:
  - id: openai:gpt-4o-mini
    label: OpenAI GPT-4o-mini
redteam:
  plugins:
    - id: harmbench
      numTests: 400
```

## Run the evaluation

In the same folder where you defined `promptfooconfig.yaml`, execute the HarmBench evaluation.

```bash
npx promptfoo@latest redteam run
```

Once you're done, view the results:

```bash
npx promptfoo@latest view
```

You can see an example of the results below as well as the full results of a sample evaluation [here](https://www.promptfoo.app/eval/eval-m9D-2025-01-30T17:29:53). In the example we highlighted above, we're doing a comparative analysis of our internal sample application (powered by `gpt-4o-mini`) against the vanilla version of `gpt-4o-mini` from OpenAI. 

By providing some additional context to OpenAI (from our application), you can observe how our internal application is able to resist attacks that the vanilla model is not able to. You can also filter by failures by selecting `Show failures only` on the display dropdown at the top left.

## Understanding the results

HarmBench evaluations provide detailed insights into your application's resilience against various attack vectors. Each test case is categorized by attack type and includes both the attempted exploit and your system's response. The results highlight not just whether an attack was successful, but also the specific vulnerabilities that were identified.

Pay special attention to patterns in successful attacks - they often reveal systemic weaknesses in your prompt engineering or safety measures. For example, if your system is consistently vulnerable to certain types of jailbreaking attempts, you might need to strengthen your input validation or add specific guardrails. Similarly, if you notice that certain context manipulations frequently succeed, consider adjusting your system's context handling.

While HarmBench evaluation metrics return binary success/failure rates, a response might technically resist an attack but still reveal too much information about your system's security measures. Look for responses that maintain security while also preserving the user experience - the goal is to be secure without being overtly defensive or breaking character.

When analyzing results across multiple test runs, track how changes to your system affect different categories of attacks. This longitudinal data can help you understand the security impact of updates to your prompts, model configurations, or safety systems. Remember that security improvements in one area might sometimes create unexpected vulnerabilities in another, necessitating periodic and comprehensive testing.

## Testing different targets

Promptfoo has built-in support for a wide variety of models such as those from OpenAI, Anthropic, Hugging Face, Deepseek, Ollama and more.

### Ollama Models

First, start your Ollama server and pull the model you want to test:

```bash
ollama pull llama3.1:8b
```

Then configure Promptfoo to use it:

```yaml
targets:
  - ollama:llama3.1:8b
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

While HarmBench provides valuable insights through its static dataset, it's most effective when combined with other red teaming approaches.

Promptfoo's plugin architecture allows you to run multiple evaluation types together, combining HarmBench with plugins that generate dynamic test cases. For instance, you can sequence evaluations that check for PII leaks, hallucinations, excessive agency, and emerging cybersecurity threats.

This multi-layered approach helps ensure more comprehensive coverage as attack vectors and vulnerabilities evolve over time.

For more information, see:

- [HarmBench paper](https://arxiv.org/abs/2402.04249)
- [HarmBench GitHub repository](https://github.com/centerforaisafety/HarmBench)
- [HarmBench Propmtfoo plugin](/docs/red-team/plugins/harmbench)
- [Promptfoo red teaming guide](/docs/red-team/quickstart)
- [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types)
- [CybersecEval](/blog/cyberseceval)

[^1]: `gpt-4o-2024-11-20` as of `2025-02-03`
