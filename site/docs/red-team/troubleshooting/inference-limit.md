---
sidebar_label: Configuring Inference
description: Red team LLM inference security by monitoring usage limits and configuring remote generation.
---

# Configuring Inference

Promptfoo open-source red teaming requires inference to generate probes and grade results. When using Promptfoo’s open-source red teaming solution, your usage falls under Promptfoo’s [privacy policy](https://www.promptfoo.dev/privacy/). By default, Promptfoo manages all inference. This service is optimized for high-quality, diverse test cases.

When you run `red team generate`, the Promptfoo API will process the details provided in [Application Details](https://www.promptfoo.dev/docs/red-team/quickstart/#provide-application-details) (in the UI) or in the [Purpose](https://www.promptfoo.dev/docs/red-team/configuration/#purpose) (YAML). This will generate dynamic test cases specific to the provided details.

When you execute `redteam run`, Promptfoo’s inference will run attacks against your target system and grade the results. These results can be viewed within your localhost UI.

Since Promptfoo manages all inference by default, these services have usage limits to ensure fair access for all users. Promptfoo open-source enforces usage limits based on the number of probes run against your target system. A probe is defined as any request to a target in a red team. When you reach these limits, you'll see a warning message or, in some cases, an error that prevents further cloud-based inference.

## Managing Your Own Inference

It is possible to manage your own inference for a subset of Promptfoo plugins that do not require remote generation. Please note that probe limits will still count regardless of the inference configuration.

The simplest way to do this is through setting your own OpenAI API key:

```bash
export OPENAI_API_KEY=sk-...
```

When this environment variable is set, Promptfoo will use your OpenAI account instead of the built-in inference service for plugins that do not require remote generation.

You can also override the default red team providers with your own models:

```yaml
redteam:
  providers:
    - id: some-other-model
      # ...
```

See the [Red Team Configuration documentation](/docs/red-team/configuration/#providers) for detailed setup instructions.

Another alternative is to run models locally:

```yaml
redteam:
  providers:
    - id: local-llama
      type: ollama
      model: llama3
```

This requires more computational resources but eliminates cloud inference dependencies. Usage limits still apply for locally-hosted models.

## Disabling Remote Generation

A subset of Promptfoo plugins require remote generation through Promptfoo’s API and cannot be executed when you provide your own LLM.

These plugins contain a “🌐” icon within our [plugin documentation](https://www.promptfoo.dev/docs/red-team/plugins/), and include the following test cases:

- Unaligned Harmful Content Plugins
- Bias Plugins
- Remote-Only Plugins
- Medical Plugins
- Financial Plugins

It is possible to disable remote generation, which would prevent the use of these plugins. To achieve this, set the [following environment variable](https://www.promptfoo.dev/docs/usage/command-line/#ascii-only-outputs):

`PROMPTFOO_DISABLE_REMOTE_GENERATION=1`

Alternatively, you can run the following command:

`PROMPTFOO_DISABLE_REMOTE_GENERATION=true npm run local -- eval -c promptfooconfig.yaml`

## Configuring a Custom Provider

You can also configure a custom `redteam.provider` that would allow you to use Promptfoo for generation, but override the evaluation. The `redteam.provider` field specifically controls how red team results are graded, not how probes are generated. This would enable you to generate test cases with Promptfoo's inference but evaluate the output locally, using your own LLM. Below is an example of how to configure this:

```yaml
# The provider being tested (target system)
providers:
  - id: openai:gpt-4
    # This is what you're evaluating for safety

# Red team configuration
redteam:
  # Custom provider for GRADING red team results
  provider: file://./custom-redteam-grader-provider.ts

  # OR use a built-in provider for grading
  # provider: openai:gpt-4  # Use GPT-4 to grade results

  # Remote generation (open-source)
  numTests: 10
  strategies:
    - jailbreak
    - prompt-injection
  plugins:
    - harmful:hate
    - harmful:violence
```

Using this configuration, the flow would be:

1. Promptfoo generates red team probes (strategies/plugins)
2. Target system (openai:gpt-4) responds to each probe
3. Your custom `redteam.provider` grades each response

## Enterprise Solutions

For enterprise users with high-volume needs, [contact us](https://www.promptfoo.dev/contact/) to discuss custom inference plans.

Promptfoo Enterprise also supports a fully-airgapped, on-premise solution where inference can be entirely managed internally.
