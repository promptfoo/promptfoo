---
title: 'AI Red Teaming for complete first-timers'
description: 'A comprehensive guide to AI red teaming for beginners, covering the basics, culture building, and operational feedback loops'
authors: [tabs]
tags: [red-teaming, security, best-practices, getting-started]
keywords:
  [AI red teaming, LLM security, prompt injection, AI vulnerabilities, red team culture, AI testing]
date: 2025-07-22
image: /img/blog/ai-red-teaming-hero.jpg
imageAlt: 'Red panda mascot in a cybersecurity setting for AI red teaming'
---

# AI Red Teaming for complete first-timers

## Intro to AI red teaming

Is this your first foray into AI red teaming? And probably red teaming in general? Great. This is for you.

Red teaming is the process of simulating real-world attacks to identify vulnerabilities.

AI red teaming is the process of simulating real-world attacks to identify vulnerabilities in artificial-intelligence systems. There are two scopes people often use to refer to AI red teaming:

- Prompt injection of LLMs
- A wider scope of testing pipelines, plugins, agents, and broader system dynamics

<!-- truncate -->

Personally, I prefer the wider scope; in deliberately making services available for AI integration, companies have increased the number of vulnerabilities emerging across their entire systems. As an engineer I'd have deliberately tried to lock all those down and prevent as much direct user interaction as possible; and here we are letting natural language run amok when humans aren't exactly known for being the clearest of communicators.

We sit in an emergent space, abundant vulnerabilities are often specific and subtle, and all this unpredictability underpins an increasing number of GenAI systems deployed in production: the result is a scaling plethora of problems on our hands.

The icing on the cake: companies are (rightly) being required to avoid specific security risks.

- 🇪🇺 EU member states are forbidden from cognitive behavioural manipulation of people and real-time and remote biometric identification systems (EU AI Act)
- 🇨🇳 Providers in China must follow its AI Measures with [new labelling rules coming into effect](https://www.insideprivacy.com/international/china/china-releases-new-labeling-requirements-for-ai-generated-content/) this year;
- 🇺🇸 In the US, while most initiatives are voluntary (such as the [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)), legislation is [on its way](https://iapp.org/resources/article/us-state-ai-governance-legislation-tracker/) for the private sector.

## AI red teaming vs traditional red teaming

As the name would suggest, the focus of AI red teaming is going to revolve around AI (duh). The implications of this are:

- A shift from deterministic to non-deterministic results; multiple attempts may be required for the same attack to determine the probability distribution of results
- There's a significant portion of efforts focused around testing models and their data
- Metrics around toxicity, hallucination, and leaks rise in importance; techniques for eliciting these rise in importance similarly
- Teams may include ML and product folks as well as security engineers

## Evolving a red team practice

Let's say you got an open-source tool like Promptfoo (😇) and want to evolve your red teaming activities. Here's how I'd level up from no testing at all to something robust:

| Level                                  | Description                                                           | Characteristics                                                                                                                                                   | Promptfoo Fit                                                             |
| -------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **0: No Testing**                      | No structured eval of prompts or outputs                              | - Risks mostly unobserved<br/>- Manual spot-checks                                                                                                                | Not in use                                                                |
| **1: Ad-hoc testing**                  | Individual, uncoordinated efforts                                     | - Local/manual tests<br/>- No versioning or repeatability                                                                                                         | CLI, local YAML tests, irregular evals                                    |
| **2: Test Suites**                     | Documented test cases; shared with team. Structure; excellent!        | - Prompts/scenarios versioned<br/>- Reusable YAML tests                                                                                                           | YAML + CLI + basic CI; sharing features                                   |
| **3: CI/CD Integration**               | Testing integrated into workflows                                     | - Runs on PRs, model changes<br/>- Pass/fail gates, diffs                                                                                                         | GitHub Actions, thresholds, snapshot diffs                                |
| **4: Feedback-driven risk management** | Testing drives decisions and accountability                           | - Links to risk registers, guardrails<br/>- Observability, regression tracking                                                                                    | Tags, severity scoring, test libraries, integrations                      |
| **5: Comprehensive AI assurance**      | Red teaming integrated into full AI security and compliance pipelines | - Aligns with AI risk frameworks (e.g. OWASP)<br/>- Guardrails, model compliance, policy testing<br/>- Used by security, ML, and governance teams collaboratively | Promptfoo + guardrails + MCP + integrations with policy enforcement tools |

Around Level 2 is when engineers start to weave in AI security testing into the fabric of the development pipeline; by the time we've hit Level 3 we've hopefully developed a culture of testing and collaborative security. This culture is core to catching vulnerabilities before they hit production; a healthy culture will lead to an excellent feedback loop.

Simply running some tests without ingenuity and intention won't net the best results.

And we want to net the best results so our red teaming efforts are effective.

## Building a red teaming culture

As previously mentioned, a strong red teaming will net the best results. Typically, this will consist of:

- **Cross-functional ownership**: Security, ML, Product, and Legal must work together
- **Transparency**: Excellent documentation exposes failures as a result
- **Diversity of perspective**: Broader team input catches more failure modes
- **Incentives**: Teams need space and motivation to test
- **Regulatory support**: Red teaming shows maturity to auditors and regulators

On that last point - many members of any audience interested in security testing will look for red teaming results - starting from [system cards](/blog/system-cards-go-hard/) all the way down the pipeline to post-production reports.

The team at Promptfoo is invested in making red teaming a repeatable, sharable, and collaborative process.

## Feedback loops: operational AI red teaming

The following stages describe - practically - an example of AI red teaming operations that can be used to establish a loop. Loops will differ between use cases, particularly at an organizational level.

| Stage             | Description                                                                                                        | Using Promptfoo                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **Inputs**        | - Declarative test cases <br/>- Team-submitted concerns, scenarios, or compliance requirements<br/>- User feedback | - Write and version test cases as YAML <br/> - Tag test cases by risk or compliance goal          |
| **Execution**     | - Prompt test runs (manual or CI) <br/>- Adversarial probing                                                       | - Run tests manually/using CI<br/>- Explore variants                                              |
| **Observability** | - Failure clustering, diffs, regressions <br/>- Model comparisons and severity ratings                             | - Visual diffs of outputs <br/>- Track regressions across models or time <br/>- Severity scoring  |
| **Feedback**      | - Updated prompts, rules, or model strategies <br/>- Inputs to retraining or guardrail systems                     | - Close the loop by updating test YAMLs <br/>- Feed failure examples into retraining or hardening |

:::tip

Promptfoo works with enterprise clients to fit tooling into their workflows due to each project's custom requirements.

:::

## In red teaming we trust

Red teaming should not be optional for any system with LLM integration. Numerous are the rewards in making it a continuous, systemic process: software with a reputation of accountability and safety. That earns trust from users in both the product and the brand.

Moving from reactive to resilient is the best thing you can do for the security of your product. If you're considering using a tool like Promptfoo to make your systems more robust—heck yes, go you! 🥳

## See Also

- [Red Team GPT](/blog/red-team-gpt/)
- [Red Team Claude](/blog/red-team-claude/)
- [Getting Started with Red Teaming](/docs/red-team/)
- [OWASP Top 10 for LLMs](/blog/owasp-top-10-llms-tldr/)
