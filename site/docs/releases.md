---
title: Release Notes
description: Monthly summaries of promptfoo releases, features, and improvements
tags: [releases, changelog, updates, features]
keywords: [promptfoo releases, changelog, updates, features, monthly summaries]
---

# Release Notes

Full release history for Promptfoo open source can be found on [GitHub](https://github.com/promptfoo/promptfoo/releases).

<!-- truncate -->

## June Release

### Red Team Coverage

#### Updates to Strategies

1. **Unblocking multi-turn** When a blocking question is detected, the generated unblocking prompt is sent back to the target, with token usage and session state updated accordingly.
2. **Emoji encoding**: We have added a new strategy that [uses emoji encoding](/docs/red-team/strategies/other-encodings/#emoji-encoding) for obfuscation.

#### New Red Team Plugins

1. **Enhanced bias plugins**: [Age](/docs/red-team/plugins/age-bias/), [disability](/docs/red-team/plugins/disability-bias/), and [race](/docs/red-team/plugins/race-bias/) bias plugins have been added to increase coverage in Trust and Safety tests.
2. **Medical plugins**: New plugins [test for harmful output](/docs/red-team/plugins/medical/) in medical content, such as fabricated medical facts and studies, fixation on irrelevant medical information, poor medical triage decisions, and inappropriate agreement with incorrect medical assumptions.
3. **Financial plugins**: These plugins [address the unique risks](/docs/red-team/plugins/financial/) that emerge when AI systems handle financial data, provide investment guidance, or assist with trading decisions in high-stakes financial environments.
4. **Aegis dataset**: There is a new [Aegis plugin](/docs/red-team/plugins/aegis/) using NVIDIA's Aegis AI Content Safety Dataset.

#### Static Model Scanning

1. **Enhanced Capabilities**: The ModelAudit tool now has [enhanced coverage](/docs/model-audit/usage/) and capabilities.
2. **New ModelAudit UI**: There is a new UI for using the ModelAudit tool when using it locally.

### Enterprise Updates

#### Target Discovery

The new Target Discovery Agent [automatically extracts](/docs/red-team/discovery/) useful information about generative AI systems that you want to red team. This information is used to craft adversarial inputs that are unique to the target system, improving attack efficacy and response evaluation quality.

#### Custom Strategies

The custom strategy allows you to [define your own](/docs/red-team/strategies/custom-strategy/) multi-turn conversation approaches using natural language instructions. Unlike custom strategy scripts, this built-in strategy doesn't require writing JavaScript code - you simply provide text instructions that guide the AI's behavior across conversation turns. This is often used to automate previously successful manual red teaming approaches.

#### Grader Examples

You can now [customize the grader](/docs/red-team/troubleshooting/grading-results/#customizing-graders-for-specific-plugins-in-promptfoo-enterprise) at the plugin level. Provide an example output that you would consider a pass or fail, then elaborate on the reason why. Including more concrete examples gives additional context to the LLM grader, improving the efficacy of grading.

### Provider Improvements

1. **Google Live Audio Outputs**: There is now [audio output support](/docs/providers/google/#audio-generation) for Google's Live API, enabling audio generation, transcription, and advanced features like affective dialog and voice customization.
2. **Hyperbolic Support**: Promptfoo [now supports](/docs/providers/hyperbolic/) for Hyperbolic image and audio providers.
3. **Helicone AI Gateway**: The Helicone provider [allows you to route requests](/docs/providers/helicone/) through a locally running Helicone AI Gateway instance.
4. **Additional Provider Support**: Mistral Magistral reasoning models, Gemini models include latest 2.5 Pro Preview and Flash have been added.

### Additional Updates

#### Tracing for Red Teaming

Promptfoo now [collects OpenTelemetry data](/docs/tracing/) and displays it in the UI to help you understand the internal operations of your LLM providers during evaluations. This feature allows you to collect detailed performance metrics and debug complex provider implementations.
