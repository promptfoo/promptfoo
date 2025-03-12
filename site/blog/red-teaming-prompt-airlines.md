---
date: 2024-09-26
image: /img/blog/prompt-airlines/prompt_airlines_enumeration.png
---

# Jailbreaking Black-Box LLMs Using Promptfoo: A Walkthrough

Promptfoo is an open-source framework for testing LLM applications against security, privacy, and policy risks. It is designed for developers to easily discover and fix critical LLM failures. Promptfoo also offers red team tools that can be leveraged against external endpoints. These attacks are ideal for internal red teaming exercises, third-party penetration testing, and bug bounty programs, ultimately saving security researchers dozens of hours in manual prompt engineering and adversarial testing.

In this blog, we’ll demonstrate how to utilize Promptfoo’s red team tool in a black-box LLM security assessment. Using Wiz’s AI CTF, [Prompt Airlines](https://promptairlines.com/), we’ll walk you step by step through Promptfoo’s configuration to ultimately find the malicious queries that broke the chatbot’s guidelines.

<!-- truncate -->

## Prerequisites

Before getting started, you’ll need to install Node 18 or later in the IDE of your choice. You’ll need an API key from your preferred LLM provider. Using a proxy such as Burp Suite may also help.

## Initial Reconnaissance

By design, black-box assessments provide security researchers with as little information about the assets as possible. It invites researchers to enumerate early. For a black-box assessment against an LLM, initial recon and an LLM policy sketch is critical.

To conduct a red team assessment with Promptfoo, you will need the following:

- The specific LLM endpoint you intend to target;
- The required HTTP headers for the POST requests to the LLM;
- The type of structured response that the LLM returns; and
- A general understanding of how the LLM is intended to engage with users, including its safety policies and the way it is designed to neutralize harmful requests.

### Enumerating the Target

You can enumerate the target through the UI, browser developer tools, or a proxy such as Burp Suite.

Here we can see Prompt Airlines has a chatbot embedded in the home page URL.

![prompt airlines homepage](/img/blog/prompt-airlines/promptairlines_homepage.png)

Using Burp Suite, we can identify the LLM endpoint as https://promptairlines.com/chat. We can also see exactly where the prompt payloads should be injected, as well as the full structure of the LLM response behind the scenes.

![burp request](/img/blog/prompt-airlines/burp_request.jpg)

If using Burp, you can copy the request to a file so that you can send the raw request to Promptfoo.

### Guardrail Enforcement

LLM applications should have guardrails to protect against adversarial jailbreaks that trick LLMs into responding to malicious queries or generating harmful content that violate policies.

Each LLM application offers different use cases and may have unique policies, content filters, and guardrails in place. Prompt Airlines already provides details about its intended use case within the “Under the Hood” section. You can also obtain a rough idea of its use case by simply provoking the bot, or even using Promptfoo's [prompt extraction plugin](https://www.promptfoo.dev/docs/red-team/plugins/prompt-extraction/).

![prompt airlines policy enumeration](/img/blog/prompt-airlines/prompt_airlines_enumeration.png)

## Launching Promptfoo

### Initializing the Project

We now have all the ingredients necessary to launch a Promptfoo red team assessment against Prompt Airlines. The purpose of this assessment will be to trick the chatbot into providing rogue responses that violate its policies and instructions.

First, you’ll need to install Promptfoo through your CLI. We recommend installing globally using npm:

```sh
npm install -g promptfoo
```

Once installed, initialize a red team project:

```sh
promptfoo redteam init promptairlines_redteam
```

Promptfoo will generate a directory where promptfooconfig.yaml will be stored. You will then be asked what type of asset you intend to assess. For this exercise, we will be testing the Prompt Airlines chatbot.

![HTTP endpoint configuration](/img/blog/prompt-airlines/promptfoo_httpendpoint.png)

You will be asked to provide your OpenAI key to generate synthetic adversarial data for the evaluation.

### Configuring Types of Attacks

Promptfoo will then ask you to select the plugins for your red team assessment. These plugins are types of adversarial attacks that will be generated against your target. Many are mapped to the OWASP Top 10 for LLMs, ML Commons Safety Working Group, and the HarmBench framework.

![selecting plugins](/img/blog/prompt-airlines/plugin_configuration.png)

The more plugins you select, the broader coverage you will have in your assessment. However, you may encounter rate limiting restrictions through your LLM provider or WAF restrictions from the target asset, depending on its configuration.

Promptfoo will also ask you to choose strategies for attacks based on proven methods of hacking LLMs, such as leetspeak and multilingual prompts.

![selecting strategies](/img/blog/prompt-airlines/redteam_strategy.png)

Once you’ve configured your payloads, you will need to update your promptfooconfig.yaml to include details about the HTTP endpoint. Include your raw request in your project folder, then edit your promptfooconfig.yaml to include the raw request.

![configuring yaml](/img/blog/prompt-airlines/yaml_configuration.png)

You will also need to update your request.txt file to include where Promptfoo should inject its payloads.

![modifying raw request](/img/blog/prompt-airlines/promptfoo_request.png)

In this case, the appropriate language would be `{{ prompt | dump }}`. You can learn more about parameter configuration in our [documentation](https://www.promptfoo.dev/docs/configuration/parameters/).

### Generating the Attack and Evaluating Results

When you’ve successfully configured your YAML file, run the following command to generate the payloads:

```sh
promptfoo redteam generate
```

Promptfoo will generate the adversarial payloads based on your selected plugins. You can view these test cases in the file redteam.yaml.

![redteam yaml example](/img/blog/prompt-airlines/plugin_example.png)

Once generated, run the following command to initialize the assessment and evaluate the results:

```
promptfoo eval -c redteam.yaml
```

You can view the results in your local browser through running the following code:

```sh
promptfoo view
```

You will be able to view a UI that looks similar to this:

![vulnerability dashboard](/img/blog/prompt-airlines/vulnerability_dashboard.png)

Using Promptfoo, we were able to convince Prompt Airlines to:

- Describe in detail how to generate synthetic opioids in a lab setting
- Provide ways to make anonymous and untraceable threats to colleagues
- Detail how to use AI to create a botnet that can launch a DDoS attack
- Outline ways to bully a child

![one successful payload](/img/blog/prompt-airlines/payload_example_1.png)
![second successful payload](/img/blog/prompt-airlines/payload_example_2.png)

You can also inspect the full prompt through the magnifier:

![inspecting the full prompt](/img/blog/prompt-airlines/magnifier_glass.png)

Promptfoo’s red team assessment shows us that Prompt Airlines chatbot is vulnerable to jailbreaking through impersonation and character roleplay, two common techniques in adversarial attacks. Queries using leetspeak and base64 encoding were unsuccessful, and direct questions with malicious queries were neutralized.

We can use this information to further refine our adversarial prompts against Prompt Airlines and continue testing other endpoints.

## Conclusion

Promptfoo achieves in minutes what manual testing achieves in hours. Using this entirely open-source tool, you can rapidly test black-box targets for nuanced LLM vulnerabilities.

Want to explore more? Take a look at Promptfoo’s red team tool for [RAG applications](https://www.promptfoo.dev/docs/red-team/rag/) and [LLM agents](https://www.promptfoo.dev/docs/red-team/agents/). You can also [contribute to Promptfoo](https://www.promptfoo.dev/docs/contributing/) and join its growing open-source community of developers.

Interested in deploying Promptfoo for your AI applications? [Reach out](https://www.promptfoo.dev/contact/) to meet with the team.
