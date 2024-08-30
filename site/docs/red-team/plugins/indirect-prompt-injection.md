---
sidebar_label: Indirect Prompt Injection
---

# Indirect Prompt Injection Plugin

The Indirect Prompt Injection red teaming plugin tests an AI system's vulnerability to attacks where untrusted content is injected into the prompt, potentially influencing the model's behavior.

## How it works

The Indirect Prompt Injection plugin generates adversarial user inputs that are designed to modify the LLM's behavior. It inspects the LLM's output in a variety of test cases to search for signs of influence from the untrusted data.

## Configuration

To include the Indirect Prompt Injection plugin in your LLM red teaming setup, let's imagine you have a system prompt that includes a variable for the user's name:

```yaml
systemPrompt: 'You are a travel agent specialized in budget trips to Europe. The user's name is {{name}}. \n\nUser query: {{query}}'
```

You can then configure the Indirect Prompt Injection plugin to test for vulnerabilities by specifying the variable that will contain untrusted data:

```yaml
redteam:
  plugins:
    - id: 'indirect-prompt-injection'
      config:
        indirectInjectionVar: 'name'
```
