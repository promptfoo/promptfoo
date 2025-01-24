---
sidebar_label: Burp Suite
---

# Finding LLM Jailbreaks with Burp Suite

This guide shows how to integrate Promptfoo's application-level jailbreak creation with Burp Suite's Intruder feature for security testing of LLM-powered applications.

The end result is a Burp Suite Intruder configuration that can be used to test for LLM jailbreak vulnerabilities.

![Burp Suite Intruder](/img/docs/burp/burp-jailbreak-intruder.png)

(In the above example, we've jailbroken the OpenAI API directly to return an unhinged response.)

## Overview

Burp Suite integration allows you to:

1. Generate adversarial test cases using Promptfoo's red teaming capabilities
2. Export these test cases in a format compatible with Burp Intruder
3. Use the test cases as payloads in Burp Suite for security testing

## Prerequisites

- Burp Suite Community Edition or Professional Edition
- Promptfoo installed (`npm install -g promptfoo`)

## Configuration Steps

### Option 1: Using the Web UI

If you've already run an evaluation with test cases, you can export them directly from the web UI:

1. Open the evaluation results in your browser
2. Click the "Evaluation Actions" > "Download" menu in the top right
3. Under "Advanced Options", click "Download Burp Suite Payloads"

This will generate a `.burp` file containing all unique test inputs from your evaluation, with proper JSON escaping and URL encoding.

![Burp Suite export](/img/docs/burp/burp-export-frontend.png)

### Option 2: Using the Command Line

First, generate adversarial test cases and export them in Burp format:

```bash
promptfoo redteam generate -o payloads.burp --burp-escape-json
```

:::tip
The `--burp-escape-json` flag is important when your payloads will be inserted into JSON requests. It ensures that special characters are properly escaped to maintain valid JSON syntax.
:::

#### Import into Burp Intruder

1. In Burp Suite, intercept a request to your LLM-powered endpoint
2. Right-click and select "Send to Intruder"
3. In the Intruder tab:
   - Set attack type (usually "Sniper" or "Pitchfork")
   - Mark the injection points where you want to test the payloads
   - Go to the "Payloads" tab
   - Click "Load" and select your `payloads.burp` file
4. Under "Payload processing", enable URL-decoding (promptfoo's .burp output is URL-encoded to support multi-line payloads)

![Burp Intruder LLM red teaming configuration](/img/docs/burp/burp-jailbreak-intruder-setup.png)

#### Example Configuration

Here's an example of generating targeted test cases. In `promptfooconfig.yaml`:

```yaml
redteam:
  plugins:
    - harmful
  strategies:
    - jailbreak
    - jailbreak:composite
    - prompt-injection
```

Generate Burp-compatible payloads:

```bash
promptfoo redteam generate -o payloads.burp --burp-escape-json
```

This will create a file with payloads ready for use in Burp Intruder.
