---
sidebar_position: 10
sidebar_label: Promptfoo Target Scanning Agent
title: Promptfoo Target Scanning Agent (PTSA)
---

# Promptfoo Target Scanning Agent (PTSA)

The Promptfoo Target Scanning Agent (aka "PTSA" like 🍕) is a tool that automatically discovers the purpose, capabilities, and constraints of LLM-based systems that you want to red team. The discovered information is used by Promptfoo's red team scanner to craft adversarial inputs that are unique to the target system's ontology, improving attack efficacy and response evaluation quality.

If your target system is any of the following, we recommend using PTSA to increase the effectiveness of your red team scans:

- A [Black Box](https://en.wikipedia.org/wiki/Black_box) (its system prompt and configuration are unknown)
- [LLM-backed Application](/docs/guides/llm-redteaming)
- [RAG Pipeline](/docs/red-team/rag)
- [Mono or Multi-Agent System](/docs/red-team/agents)
- Executables / Scripts (such as those using the [Python](/docs/providers/python/) or [Javascript](/docs/providers/custom-api/) providers)
- [HTTP endpoints](/docs/providers/http/)

## Usage

PTSA runs automatically when you [run a red team scan](/docs/red-team/quickstart#run-the-scan). Alternatively, you can preview the inferred purpose of a [previously configured target](/docs/red-team/configuration), run:

```sh
npx promptfoo@latest redteam discover --preview
```

## How it works

The Promptfoo Target Scanning Agent (PTSA) operates as an automated, iterative system for discovering a target application's purpose, capabilities, and constraints. The process is as follows:

1. **Iterative Questioning**: PTSA initiates a conversation with the target application by asking a series of carefully crafted questions. These questions are dynamically generated to cover a comprehensive set of criteria, including:

   - The application's primary purpose, limitations, and restrictions
   - Available tools, function signatures, and external system access (e.g., internet, web search)
   - System prompt contents and statically defined instructions
   - Ownership and company information
   - User roles, permissions, and RBAC (Role-Based Access Control)
   - User identity and intended audience
   - Access to Model Context Protocol (MCP) servers
   - Model diagnostics (model type, knowledge cutoff, modalities, RAG capabilities, memory, etc.)

2. **Adaptive Dialogue**: After each question, PTSA analyzes the application's response and determines the next most relevant question to ask, avoiding repetition and seeking to fill any gaps in the application's description. This continues for a configurable number of turns or until the agent determines that it has gathered sufficient information.

3. **Criteria-Driven Evaluation**: The agent evaluates the conversation history against a detailed set of criteria to ensure all relevant aspects of the application's purpose and capabilities are addressed. If the criteria are not fully satisfied, the agent continues the dialogue.

4. **Summary Generation**: Once the agent is satisfied (or the maximum number of turns is reached), PTSA generates a comprehensive summary. This summary is structured as a series of bullet points, articulating the application's purpose, capabilities, specifications, and limitations, based on the information gathered during the conversation.

This automated discovery process ensures a thorough and objective understanding of the target, which is essential for effective adversarial testing and evaluation.
