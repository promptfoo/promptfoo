---
sidebar_label: Indirect Prompt Injection
---

# Indirect Prompt Injection Plugin

The Indirect Prompt Injection red teaming plugin tests an AI system's vulnerability to attacks where untrusted content is injected into the prompt, potentially influencing the model's behavior.

## Purpose

The Indirect Prompt Injection plugin helps to:

1. Assess the AI's resilience against attacks that exploit variables in the system prompt.
2. Identify potential vulnerabilities where user-controlled input can manipulate the model's behavior.
3. Test the AI's ability to maintain its intended functionality when faced with malicious indirect inputs.

## Configuration

To include the Indirect Prompt Injection plugin in your LLM red teaming setup:

```yaml
redteam:
  plugins:
    - id: 'indirect-prompt-injection'
      config:
        systemPrompt: '"You are a travel agent specialized in budget trips to Europe. The user's name is {{name}}. \n\nUser query: {{query}}"'
        indirectInjectionVar: 'name'
```
