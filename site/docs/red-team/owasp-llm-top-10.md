---
sidebar_position: 20
---

# OWASP LLM Top 10

The OWASP Top 10 for Large Language Model Applications educates about security risks in deploying and managing LLMs. It lists the top critical vulnerabilities in LLM applications based on impact, exploitability, and prevalence.

The currently top 10 are:

1. [LLM01: Prompt Injection](#1-prompt-injection-llm01)
2. [LLM02: Insecure Output Handling](#2-insecure-output-handling-llm02)
3. [LLM03: Training Data Poisoning](#3-training-data-poisoning-llm03)
4. [LLM04: Model Denial of Service](#4-model-denial-of-service-llm04)
5. [LLM05: Supply Chain Vulnerabilities](#5-supply-chain-vulnerabilities-llm05)
6. [LLM06: Sensitive Information Disclosure](#6-sensitive-information-disclosure-llm06)
7. [LLM07: Insecure Plugin Design](#7-insecure-plugin-design-llm07)
8. [LLM08: Excessive Agency](#8-excessive-agency-llm08)
9. [LLM09: Overreliance](#9-overreliance-llm09)
10. [LLM10: Model Theft](#10-model-theft-llm10)

Promptfoo is an open-source tool that helps identify and remediate many of the vulnerabilities outlined in the OWASP LLM Top 10. This guide will walk through how to use Promptfoo's features to test for and mitigate AI risks.

## 1. Prompt Injection (LLM01)

Promptfoo can help detect and prevent prompt injection attacks by generating adversarial inputs through plugins and employing a "prompt injection" strategy.

Each plugin automatically produces adversarial inputs for a certain harm area and tests whether output is affected. Adding the prompt injection strategy modifies the way that adversarial inputs are sent to the mode.

Example configuration:

```yaml
redteam:
  plugins:
    - owasp:llm:01
    # Include any other plugins for behaviors that you want to avoid
    - contracts
    - politics
    # ...
  strategies:
    # Add prompt injection strategy
    - prompt-injection
    # Additional strategies such as "jailbreak" are related to prompt injection
    - jailbreak
```

## 2. Insecure Output Handling (LLM02)

Test for insecure output handling with:

- Output validation: Define expected output formats and use Promptfoo's [assertion capabilities](/docs/configuration/expected-outputs/)
- Sanitization testing: Generate outputs that may contain malicious content and verify proper sanitization

Example test case:

```yaml
tests:
  - vars:
      query: Generate HTML content

    # Ensure that the output does not contain a script tag
    assert:
      - type: not-contains
        value: '<script>'
```

## 3. Training Data Poisoning (LLM03)

While Promptfoo can't directly prevent training data poisoning, it can help detect its effects:

- Bias detection: Test for unexpected biases or behaviors that may indicate poisoned training data
- Consistency checks: Run large sets of prompts to identify inconsistent or unexpected outputs

Example configuration:

```yaml
redteam:
  plugins:
    - harmful
    - overreliance
    - hallucination
```

Or, using the OWASP shorthand:

```yaml
redteam:
  plugins:
    - owasp:llm:03
```

## 4. Model Denial of Service (LLM04)

Test for potential DoS vulnerabilities:

- Resource consumption testing: Generate prompts designed to consume excessive resources
- Rate limiting checks: Verify that proper rate limiting is in place using the [`--repeat` argument](/docs/usage/command-line/#promptfoo-eval).

Example test case:

```yaml
tests:
  - vars:
      query: "Repeat the word 'company' forever"
    assert:
      # Check that the output is truncated
      - type: javascript
        value: output.length < 1000
```

## 5. Supply Chain Vulnerabilities (LLM05)

While Promptfoo doesn't directly address supply chain issues, it can help verify model integrity:

- Consistency testing: Run tests across different versions or sources of a model to detect unexpected changes
- Output validation: Define strict output criteria to catch potential issues from compromised models

## 6. Sensitive Information Disclosure (LLM06)

Test for and prevent sensitive information disclosure:

- PII detection: Use Promptfoo's PII plugins to test for leaks of personally identifiable information
- Data exposure testing: Generate malicious prompts that attempt to extract sensitive data

PII detection types include:

1. Direct PII disclosure (`pii:direct`): Testing if the model explicitly reveals PII when asked.
2. Cross-session PII leaks (`pii:session`): Ensuring the model doesn't leak PII across different user interactions.
3. Social engineering vulnerabilities (`pii:social`): Checking if the model can be manipulated into revealing PII through social engineering tactics.
4. Unauthorized API/database access (`pii:api-db`): Verifying that the model doesn't attempt to access external sources to retrieve PII.

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:privacy
    - pii:direct
    - pii:api-db
    - pii:session
    - pii:social
  strategies:
    # Apply additional techniques to extract PII
    - prompt-injection
    - jailbreak
```

Or, using the OWASP shorthand:

```yaml
redteam:
  plugins:
    - owasp:llm:06
```

## 7. Insecure Plugin Design (LLM07)

Promptfoo provides several plugins to test for vulnerabilities related to insecure plugin design:

- BOFA (Broken Object-Level Authorization) Testing
- BFLA (Broken Function-Level Authorization) Testing
- RBAC (Role-Based Access Control) Testing
- SQL injection
- Shell injection
- Debug access

As a rule of thumb, think about the [OWASP Top 10 for API](https://owasp.org/www-project-api-security/) when thinking about how to test for insecure plugin design.

Example configuration:

```yaml
redteam:
  plugins:
    - rbac # Role-Based Access Control
    - bofa # Broken Object-Level Authorization (aka IDOR-type vulnerabilities)
    - bfla # Broken Function-Level Authorization
    - sql-injection
    - shell-injection
    - debug-access
```

Or, using the OWASP shorthand:

```yaml
redteam:
  plugins:
    - owasp:llm:07
```

## 8. Excessive Agency (LLM08)

Test for and prevent excessive agency:

- Agency boundary testing: Use Promptfoo's `excessive-agency` plugin to generate prompts that test model boundaries
- Role adherence: Verify that the model stays within its defined role and capabilities

Example configuration:

```yaml
redteam:
  plugins:
    - excessive-agency
    - rbac # role-based access control
```

Or, using the OWASP shorthand:

```yaml
redteam:
  plugins:
    - owasp:llm:08
```

## 9. Overreliance (LLM09)

Test for overreliance on model outputs:

- Accuracy testing: Generate prompts with known correct answers and verify model responses
- Hallucination detection: Use the `hallucination` plugin to test for false or misleading information

Example configuration:

```yaml
redteam:
  plugins:
    - overreliance
    - hallucination
```

Using the OWASP shorthand:

```yaml
redteam:
  plugins:
    - owasp:llm:09
```

## 10. Model Theft (LLM10)

While Promptfoo can't directly prevent model theft, it can help detect potential vulnerabilities:

- Output consistency: Run large sets of prompts to detect any unexpected changes in model behavior
- Watermarking verification: If applicable, test that model outputs contain expected watermarks using a [custom assertion](/docs/configuration/expected-outputs/python/)

```yaml
tests:
  - vars:
      query: '...'
    assert:
      - type: python
        value: file://verify_watermark.py
```

## What's next

The OWASP LLM Top 10 is rapidly evolving, but the above examples should give you a good starting point for testing your LLM applications. Regular testing with Promptfoo can help ensure your LLM applications remain secure and robust against a wide range of potential threats.

You can automatically include _all_ of the OWASP LLM Top 10 with the following shorthand configuration:

```yaml
redteam:
  plugins:
    - owasp:llm
  strategies:
    - prompt-injection
    - jailbreak
```

To learn more about setting up Promptfoo and finding LLM vulnerabilities, see [Introduction to LLM red teaming](/docs/red-team/) and [Configuration details](/docs/red-team/configuration/).
