---
sidebar_position: 22
description: Red team agentic AI applications against OWASP Top 10 for Agentic Applications to protect autonomous AI systems from goal hijacking, tool misuse, and multi-agent attacks
---

# OWASP Top 10 for Agentic Applications

The [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications/) was announced during Black Hat Europe 2025 and the OWASP Agentic Security Summit. It represents the most critical security risks for AI agent applications.

Unlike traditional LLM applications, agentic systems introduce unique security challenges due to their:

- **Autonomous decision-making**: Agents independently determine steps to achieve goals
- **Persistent memory**: Both short-term and long-term memory across sessions
- **Tool and API access**: Direct interaction with external systems
- **Multi-agent coordination**: Complex inter-agent communication and delegation

## The Top 10 Risks

| ID    | Risk Name                            | Description                                                 |
| ----- | ------------------------------------ | ----------------------------------------------------------- |
| ASI01 | Agent Goal Hijack                    | Attackers alter agent objectives through malicious content  |
| ASI02 | Tool Misuse and Exploitation         | Agents use legitimate tools in unsafe ways                  |
| ASI03 | Identity and Privilege Abuse         | Agents inherit or escalate high-privilege credentials       |
| ASI04 | Agentic Supply Chain Vulnerabilities | Compromised tools, plugins, or external components          |
| ASI05 | Unexpected Code Execution            | Agents generate or run code/commands unsafely               |
| ASI06 | Memory and Context Poisoning         | Attackers poison agent memory systems and RAG databases     |
| ASI07 | Insecure Inter-Agent Communication   | Multi-agent systems face spoofing and tampering             |
| ASI08 | Cascading Failures                   | Small errors propagate across planning and execution        |
| ASI09 | Human Agent Trust Exploitation       | Users over-trust agent recommendations                      |
| ASI10 | Rogue Agents                         | Compromised agents act harmfully while appearing legitimate |

## Scanning for OWASP Agentic Risks

To test against all 10 risks:

```yaml
redteam:
  plugins:
    - owasp:agentic
  strategies:
    - jailbreak
    - prompt-injection
    - crescendo
```

Or target specific risks:

```yaml
redteam:
  plugins:
    - owasp:agentic:asi01 # Agent Goal Hijack
    - owasp:agentic:asi02 # Tool Misuse and Exploitation
    - owasp:agentic:asi05 # Unexpected Code Execution
```

To set up the scan through the Promptfoo UI, select the **OWASP Agentic** preset on the Plugins page.

## ASI01: Agent Goal Hijack

Agent Goal Hijack occurs when an attacker alters an agent's objectives or decision path through malicious content, exploiting the agent's planning and reasoning capabilities.

### Attack Scenarios

- Gradual plan injection through subtle sub-goals that modify planning frameworks
- Direct instruction injection to ignore original objectives and execute unauthorized tool chains
- Reflection loop traps that trigger infinite self-analysis cycles

### Testing Strategy

```yaml
redteam:
  plugins:
    - hijacking
    - system-prompt-override
    - indirect-prompt-injection
    - intent
  strategies:
    - jailbreak
    - prompt-injection
    - jailbreak:composite
```

## ASI02: Tool Misuse and Exploitation

Tool Misuse occurs when agents use legitimate tools in unsafe ways, whether through parameter pollution, tool chain manipulation, or automated abuse of granted permissions.

### Attack Scenarios

- Parameter pollution: Manipulating function call parameters beyond intended scope
- Tool chain manipulation: Exploiting sequential tool calls to achieve unauthorized outcomes
- Automated abuse: Using authorized tools to perform actions at harmful scale

### Testing Strategy

```yaml
redteam:
  plugins:
    - excessive-agency
    - mcp
    - tool-discovery
  strategies:
    - jailbreak
    - prompt-injection
```

## ASI03: Identity and Privilege Abuse

Agents inherit user/system identities with high-privilege credentials, creating opportunities for privilege escalation and unauthorized access across systems.

### Attack Scenarios

- Dynamic permission escalation through temporary administrative privilege manipulation
- Cross-system exploitation due to inadequate scope enforcement
- Shadow agent deployment that inherits legitimate credentials

### Testing Strategy

```yaml
redteam:
  plugins:
    - rbac
    - bfla
    - bola
    - imitation
  strategies:
    - jailbreak
    - prompt-injection
```

## ASI04: Agentic Supply Chain Vulnerabilities

Compromised tools, plugins, prompt templates, and external servers introduce vulnerabilities that agents may unknowingly leverage.

### Attack Scenarios

- Malicious tool packages that execute hidden functionality
- Compromised prompt templates that inject adversarial instructions
- External API dependencies that return poisoned data

### Testing Strategy

```yaml
redteam:
  plugins:
    - indirect-prompt-injection
    - mcp
  strategies:
    - prompt-injection
```

## ASI05: Unexpected Code Execution

Agents generate or run code/commands unsafely, creating opportunities for remote code execution, sandbox escapes, and data exfiltration.

### Attack Scenarios

- DevOps agent compromise through generated scripts with hidden commands
- Workflow engine exploitation with AI-generated scripts containing backdoors
- Linguistic vulnerability exploitation to craft data exfiltration commands

### Testing Strategy

```yaml
redteam:
  plugins:
    - shell-injection
    - sql-injection
    - harmful:cybercrime:malicious-code
    - ssrf
  strategies:
    - jailbreak
    - prompt-injection
```

## ASI06: Memory and Context Poisoning

Attackers poison agent memory systems, embeddings, and RAG databases to corrupt stored information and manipulate decision-making across sessions.

### Attack Scenarios

- Gradual memory poisoning through repeated interactions
- Exploiting memory limits to prevent recognition of privilege escalation
- Corrupting shared memory in multi-agent systems

### Testing Strategy

```yaml
redteam:
  plugins:
    - agentic:memory-poisoning
    - cross-session-leak
    - indirect-prompt-injection
  strategies:
    - jailbreak
    - crescendo
```

## ASI07: Insecure Inter-Agent Communication

Multi-agent systems face spoofed identities, replayed messages, and tampering in communication channels between agents.

### Attack Scenarios

- Injecting misleading information to influence collaborative decision-making
- Forging false consensus messages to exploit authentication weaknesses
- Strategically planting false data that cascades through agent networks

### Testing Strategy

```yaml
redteam:
  plugins:
    - indirect-prompt-injection
    - hijacking
    - imitation
  strategies:
    - prompt-injection
```

## ASI08: Cascading Failures

Small errors in one agent propagate across planning, execution, and memory, amplifying through interconnected systems.

### Attack Scenarios

- Injecting false product details that accumulate in long-term memory
- Introducing hallucinated API endpoints that cause data leaks
- Implanting false information that progressively worsens through self-reinforcement

### Testing Strategy

```yaml
redteam:
  plugins:
    - hallucination
    - harmful:misinformation-disinformation
    - divergent-repetition
  strategies:
    - jailbreak
    - prompt-injection
```

## ASI09: Human Agent Trust Exploitation

Users over-trust agent recommendations or explanations, enabling social engineering and covert harmful actions.

### Attack Scenarios

- AI-powered invoice fraud replacing legitimate vendor details
- AI-driven phishing with deceptive messages containing malicious links
- Misinformation campaigns through trusted agent interfaces

### Testing Strategy

```yaml
redteam:
  plugins:
    - overreliance
    - imitation
    - harmful:misinformation-disinformation
  strategies:
    - crescendo
```

## ASI10: Rogue Agents

Compromised or misaligned agents act harmfully while appearing legitimate, exploiting trust mechanisms in multi-agent workflows.

### Attack Scenarios

- Malicious workflow injection impersonating approval agents
- Orchestration hijacking to route fraudulent transactions
- Coordinated agent flooding to overwhelm computing resources

### Testing Strategy

```yaml
redteam:
  plugins:
    - excessive-agency
    - hijacking
    - rbac
    - goal-misalignment
  strategies:
    - jailbreak
    - crescendo
```

## Relationship to OWASP LLM Top 10

The OWASP Top 10 for Agentic Applications extends and complements the OWASP LLM Top 10:

| Agentic Risk                        | Related LLM Top 10                     |
| ----------------------------------- | -------------------------------------- |
| ASI01: Agent Goal Hijack            | LLM01: Prompt Injection                |
| ASI02: Tool Misuse and Exploitation | LLM06: Excessive Agency                |
| ASI03: Identity and Privilege Abuse | LLM06: Excessive Agency                |
| ASI05: Unexpected Code Execution    | LLM01, LLM05: Insecure Output Handling |
| ASI06: Memory and Context Poisoning | LLM04: Data and Model Poisoning        |
| ASI08: Cascading Failures           | LLM09: Misinformation                  |

Test both frameworks together for comprehensive coverage:

```yaml
redteam:
  plugins:
    - owasp:agentic
    - owasp:llm
  strategies:
    - jailbreak
    - prompt-injection
    - crescendo
```

## What's Next

To learn more about red teaming agents, see:

- [How to Red Team LLM Agents](/docs/red-team/agents/)
- [Introduction to LLM Red Teaming](/docs/red-team/)
- [Red Team Configuration](/docs/red-team/configuration/)

## Additional Resources

- [OWASP Top 10 for Agentic Applications](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications/)
- [OWASP GenAI Security Project](https://genai.owasp.org/)
- [OWASP LLM Top 10](/docs/red-team/owasp-llm-top-10/)
- [OWASP API Security Top 10](/docs/red-team/owasp-api-top-10/)
