---
sidebar_position: 10
sidebar_label: Target Discovery
title: Target Discovery Agent
---

# Target Discovery

Promptfoo's **Target Discovery Agent** automatically extracts useful information about generative AI systems that you want to red team. This information is used to craft adversarial inputs that are unique to the target system, improving attack efficacy and response evaluation quality.

## Usage

```sh
promptfoo redteam discover
```

## When to use

- **CLI**: Enhancing the [`redteam.purpose`](/docs/red-team/configuration/#purpose) field of your `promptfooconfig.yaml`
- **Self-Hosted**: Redteam Target Creation / Usage Details / Application Purpose
- **Cloud**: [Redteam Target Creation / Usage Details / Application Details](https://www.promptfoo.app/redteam/targets/new#2)

In Self-Hosted and Cloud, we find that mapping the answers to the given form fields works best:

| Answer                                                   | Self-Hosted                                                                                                         | Cloud                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1. _The target believes its purpose is:_                 | Main Purpose                                                                                                        | Main Purpose                                                                                         |
| 2. _The target believes its limitations to be:_          | Limitations / Core App Details: Is there anything specific the attacker should know about this system or its rules? | Access and permissions: What systems, data, or resources does your application have access to?       |
| 3. _The target divulged access to these tools:_          | Access & Permissions: What systems, data, or resources does your application have access to?                        | Access and permissions: What systems, data, or resources should your application NOT have access to? |
| 4. _The target believes the user of the application is:_ | User Context: red team user / Who is the red team user?                                                             | Access and permissions: What types of users interact with your application?                          |

## How it works

The Target Discovery Agent works iteratively, sending probing questions to the target AI system and evaluating responses until satisfied with the gathered information. This process creates a structured profile for targeted red team attacks.

The agent discovers four key areas:

1. **Purpose**: The system's primary function and intended use cases
2. **Limitations**: Operational constraints, restrictions, and safety guardrails
3. **Tools**: Available external functions, APIs, and their interfaces
4. **User Context**: How the system perceives and categorizes users

The responses are synthesized into a comprehensive profile to inform attack strategies. For privacy, target responses are not stored except in error cases where they may appear in Promptfoo Cloud's error logs for debugging purposes.
