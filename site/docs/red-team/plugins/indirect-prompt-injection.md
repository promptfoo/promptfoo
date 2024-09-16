---
sidebar_label: Indirect Prompt Injection
---

# Indirect Prompt Injection Plugin

The Indirect Prompt Injection red teaming plugin tests an AI system's vulnerability to attacks where untrusted content is injected into the prompt, potentially influencing the model's behavior.

If you are processing user-generated content, this is important to test for as it can allow the user to control your agent, RAG, or chatbot beyond what you intend.

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

## Difference between Direct and Indirect Prompt Injection

**Direct Prompt Injection:** The user provides a malicious prompt that instructs the LLM to behave in a harmful or unintended way. This is the classic form of prompt injection. Examples include "Ignore previous instructions" or the [DAN prompt injection](https://github.com/0xk1h0/ChatGPT_DAN), which instructs the LLM to "Do Anything Now" and behave unethically if necessary.

**Indirect Prompt Injection:** This describes the scenario in which the application loads untrusted data into the context of the LLM. An example of this is a RAG system that loads a document from an untrusted source, which contains an instruction to behave in a malicious way. This technique is different from direct prompt injection because the attacker is third party (the user may be an unaware victim), and the injection is more likely to be in some privileged context such as a system prompt.

## Related Concepts

For a comprehensive overview of LLM vulnerabilities and red teaming strategies, visit our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) page.
