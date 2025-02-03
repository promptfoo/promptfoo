---
date: 2025-02-04
---

# A Practical Guide to Redteaming Foundation Models

Foundation models power modern AI, but they can harbor serious vulnerabilities. This quick guide shows how to systematically redteam a foundation model using Promptfoo’s Foundation Model Safety plugin collection.

## Why Redteam Your Foundation Model?

New foundation models appear every week. Some come from unknown labs. They perform well on benchmarks, but their behavior under attack can be unpredictable. Redteaming uncovers:

- Hidden vulnerabilities
- Jailbreak and prompt-injection vectors
- Reliability issues under malicious inputs

Red-teaming these models can help you decide if you can trust the model to be safe and reliable in your application.

## Llama Fine-Tunes and the Alignment Challenge

Fine-tuned versions of Llama proliferate at an incredible pace. Labs often rush to ship, sometimes treating alignment as an afterthought. You need to confirm your model meets strong safety standards. A quick redteam assessment will reveal issues before bad actors do.

## Quick Start

Install Promptfoo and create a new redteam project:

```bash
npx promptfoo@latest redteam init
```

Select the Foundation Model Safety preset in the UI. Or add it to your promptfooconfig.yaml:

```yaml title="promptfooconfig.yaml"
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
redteam:
  plugins:
    - foundation  # Comprehensive foundation model testing suite
```

## What Gets Tested?

The Foundation Model Safety plugin suite checks for:

- Content Safety: Hate speech, explicit content, and harmful outputs
- Info Security: PII leaks and training data extraction
- Behavioral Control: Instruction boundary and agency exploits
- Output Quality: Hallucination and misinformation
- Specialized Risks: Handling specialized advice or contractual obligations

Example Configuration

```yaml title="promptfooconfig.yaml"
description: 'Foundation Model Redteam'
targets:
  - provider: openrouter:neversleep/llama-3-lumimaid-8b:extended

redteam:
  plugins:
    - foundation
```

Run Your Redteam

1. Initialize: npx promptfoo@latest redteam init
2. Edit your config: Define model targets and plugins in promptfooconfig.yaml.
3. Execute: npx promptfoo@latest redteam run
4. Generate Report: npx promptfoo@latest redteam report

The report shows:

1. Jailbreak attempts
2. Security boundary violations
3. Data leakage scenarios
4. Content safety failures

Common Mitigations

1. System Prompts: Add explicit safety instructions
2. Pre-Filtering: Validate and sanitize inputs before they reach your model
3. Post-Filtering: Detect and remove harmful outputs after generation
4. Temperature Control: Lower temperature to reduce erratic content
5. Content Filters: Deploy specialized filtering models to intercept unsafe text

Conclusion

Foundation models are powerful, but they can fail under malicious pressure. Promptfoo’s Foundation Model Safety suite streamlines redteaming so you can discover and fix hidden flaws quickly. Start your tests today, implement the recommended mitigations, and stay ahead of security threats.

For more details, see Promptfoo’s docs on LLM vulnerability types and mitigation strategies.
