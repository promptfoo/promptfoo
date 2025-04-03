---
sidebar_label: Running Red Teams 
---

# Running Red Teams 

Promptfoo Cloud allows you to configure targets, plugin collections, and scan configurations that can be shared among your team. 

## Creating Targets

Targets are the LLM entities that are being tested. They can be a web application, agent, foundation model, or any other LLM entity. When you create a target, this target can be accessed by other users in your team to run scans. 

You can create a target by navigating to the "Targets" tab and clicking "Create Target". 

The "General Settings" section is where you identify the type of target you are testing and provide the technical details to connect to the target, pass probes, and parse responses. 

The "Context" section is where you provide any additional information about the target that will help Promptfoo generate adverserial probes. This is where you provide context about the target's primary objective and any rules it should follow, as well as what type of user the red team should impersonate. 

The more information you provide, the better the red team attacks and grading will be.

### Accessing External Systems

If your target has RAG orchestration or is an agent, you can select the "Accessing External Systems" option to provide additional details about the target's connection to external systems. Providing additional context about the target's access to external systems will help Promptfoo generate more accurate red team attacks and grading. 

If your target is an agent, you can provide additional context about the agent's access to tools and functions in the question "What external systems are connected to this application?" This will help Promptfoo ascertain whether it was able to successfully enumerate tools and functions when running the [tool discovery plugin](https://www.promptfoo.dev/docs/red-team/plugins/tool-discovery/). 

## Creating Plugin Collections

You can create plugin collections to share among your team. These plugin collections allow you to create specific presets to run tests against your targets, including establishing custom policies and prompts. 

To create a plugin collection, navigate to the "Plugin Collections" tab under the "Redteam" navigation header and click "Create Plugin Collection". 

![Create Plugin Collection](/img/enterprise-docs/create-plugin-collection.gif)

## Configuring Scans



