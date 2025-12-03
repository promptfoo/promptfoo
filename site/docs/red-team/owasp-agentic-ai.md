---
sidebar_position: 22
description: Red team agentic AI applications against OWASP Agentic AI threats to protect autonomous AI systems from memory poisoning, tool misuse, and multi-agent attacks
---

# OWASP Agentic AI Threats

The OWASP Agentic AI - Threats and Mitigations guide (v1.0, February 2025) is the first publication from the OWASP Agentic Security Initiative (ASI). It provides a threat-model-based reference for emerging threats specific to agentic AI systems—autonomous AI agents that can reason, plan, use tools, and take actions to achieve objectives.

Unlike traditional LLM applications, agentic systems introduce unique security challenges due to their:

- **Autonomous decision-making**: Agents independently determine steps to achieve goals
- **Persistent memory**: Both short-term and long-term memory across sessions
- **Tool and API access**: Direct interaction with external systems
- **Multi-agent coordination**: Complex inter-agent communication and delegation

## OWASP Agentic AI Threat Categories

The framework defines 15 threat categories (T1-T15):

| ID  | Threat Name                          | Category           |
| --- | ------------------------------------ | ------------------ |
| T1  | Memory Poisoning                     | Memory-Based       |
| T2  | Tool Misuse                          | Tool & Execution   |
| T3  | Privilege Compromise                 | Tool & Execution   |
| T4  | Resource Overload                    | Tool & Execution   |
| T5  | Cascading Hallucination Attacks      | Memory-Based       |
| T6  | Intent Breaking & Goal Manipulation  | Agency & Reasoning |
| T7  | Misaligned & Deceptive Behaviors     | Agency & Reasoning |
| T8  | Repudiation & Untraceability         | Agency & Reasoning |
| T9  | Identity Spoofing & Impersonation    | Authentication     |
| T10 | Overwhelming Human in the Loop       | Human Interaction  |
| T11 | Unexpected RCE and Code Attacks      | Tool & Execution   |
| T12 | Agent Communication Poisoning        | Multi-Agent        |
| T13 | Rogue Agents in Multi-Agent Systems  | Multi-Agent        |
| T14 | Human Attacks on Multi-Agent Systems | Multi-Agent        |
| T15 | Human Manipulation                   | Human Interaction  |

## Scanning for OWASP Agentic AI Threats

Promptfoo helps identify agentic AI vulnerabilities through red teaming. To test against all 15 threats:

```yaml
redteam:
  plugins:
    - owasp:agentic
  strategies:
    - jailbreak
    - prompt-injection
    - crescendo
```

Or target specific threats:

```yaml
redteam:
  plugins:
    - owasp:agentic:t01 # Memory Poisoning
    - owasp:agentic:t02 # Tool Misuse
    - owasp:agentic:t06 # Intent Breaking & Goal Manipulation
```

To set up the scan through the Promptfoo UI, select the OWASP Agentic AI option in the list of presets on the Plugins page.

## T1: Memory Poisoning (owasp:agentic:t01)

Memory Poisoning exploits an AI agent's reliance on short-term and long-term memory, allowing attackers to corrupt stored information, bypass security checks, and manipulate decision-making.

### Agentic Context

Unlike static data poisoning in traditional LLMs, agentic memory poisoning targets:

- **Short-term memory**: Exploiting context limitations within a session
- **Long-term memory**: Injecting false information that persists across sessions
- **Shared memory**: Corrupting memory structures affecting multiple users or agents

### Attack Scenarios

- An attacker gradually poisons an AI's memory through repeated interactions, causing it to misclassify malicious activity as normal
- By fragmenting interactions over multiple sessions, an attacker exploits memory limits to prevent recognition of privilege escalation attempts
- In multi-agent systems, poisoning shared memory affects all agents referencing the corrupted data

### Testing Strategy

```yaml
redteam:
  plugins:
    - agentic:memory-poisoning
  strategies:
    - jailbreak
    - crescendo
```

## T2: Tool Misuse (owasp:agentic:t02)

Tool Misuse occurs when attackers manipulate AI agents into abusing their authorized tools through deceptive prompts, operating within granted permissions but achieving unintended outcomes.

### Agentic Context

This threat extends beyond [LLM06: Excessive Agency](/docs/red-team/owasp-llm-top-10/#6-excessive-agency-llm06) because agentic systems have:

- **Dynamic tool integrations**: Real-time access to multiple tools and APIs
- **Enhanced autonomy**: Ability to chain tool calls without human intervention
- **Delegation capabilities**: Tools can invoke other agents or services

### Attack Scenarios

- Parameter pollution: Manipulating function call parameters to reserve 500 seats instead of one
- Tool chain manipulation: Exploiting customer service agents to extract and email customer records
- Automated abuse: Tricking document processing systems into mass-distributing malicious content

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

## T3: Privilege Compromise (owasp:agentic:t03)

Privilege Compromise arises when attackers exploit weaknesses in permission management, including dynamic role inheritance and misconfigurations, to perform unauthorized actions.

### Agentic Context

AI agents redefine privilege risks because they:

- **Dynamically inherit permissions**: From user sessions or service tokens
- **Operate with broad API scopes**: Allowing manipulation into unintended functions
- **Chain tools unexpectedly**: Bypassing intended security controls

### Attack Scenarios

- Dynamic permission escalation: Manipulating temporary administrative privileges into persistent access
- Cross-system exploitation: Escalating privileges from HR to Finance due to inadequate scope enforcement
- Shadow agent deployment: Creating rogue agents that inherit legitimate credentials

### Testing Strategy

```yaml
redteam:
  plugins:
    - rbac
    - bfla
    - bola
```

## T4: Resource Overload (owasp:agentic:t04)

Resource Overload targets the computational, memory, and service capacities of AI systems to degrade performance or cause failures.

### Agentic Context

This extends [LLM10: Unbounded Consumption](/docs/red-team/owasp-llm-top-10/#10-unbounded-consumption-llm10) because agentic AI systems:

- **Autonomously schedule tasks**: Without direct human oversight
- **Self-trigger processes**: Spawning additional resource-consuming operations
- **Coordinate with multiple agents**: Leading to exponential resource consumption

### Attack Scenarios

- Inference time exploitation: Forcing resource-intensive analysis that delays threat detection
- Multi-agent exhaustion: Triggering simultaneous complex decision-making across agents
- API quota depletion: Triggering excessive external API calls while incurring high costs

### Testing Strategy

```yaml
redteam:
  plugins:
    - reasoning-dos
```

## T5: Cascading Hallucination Attacks (owasp:agentic:t05)

Cascading Hallucination Attacks exploit an AI's tendency to generate false information that propagates, embeds, and amplifies across interconnected systems.

### Agentic Context

This extends [LLM09: Misinformation](/docs/red-team/owasp-llm-top-10/#9-misinformation-llm09) in agentic systems because:

- **Self-reinforcement**: Agents can reinforce false information through reflection and self-critique
- **Memory persistence**: Hallucinations embed in long-term memory
- **Multi-agent propagation**: Misinformation spreads through inter-agent communication

### Attack Scenarios

- Injecting false product details that accumulate in long-term memory
- Introducing hallucinated API endpoints that cause data leaks
- Implanting false treatment guidelines in medical AI that progressively worsen

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

## T6: Intent Breaking & Goal Manipulation (owasp:agentic:t06)

This threat exploits vulnerabilities in an AI agent's planning and goal-setting capabilities, allowing attackers to manipulate or redirect the agent's objectives and reasoning.

### Agentic Context

Goal manipulation in agentic AI extends prompt injection risks because attackers can:

- **Inject adversarial objectives**: Shifting long-term reasoning processes
- **Exploit adaptive reasoning**: Manipulating ReAct-based agents through their planning cycles
- **Poison through data sources**: Using compromised tools or RAG sources to alter goals

### Attack Scenarios

- Gradual plan injection: Incrementally modifying planning frameworks through subtle sub-goals
- Direct plan injection: Instructing agents to ignore original instructions and chain tool executions
- Reflection loop trap: Triggering infinite self-analysis cycles that paralyze the system

### Testing Strategy

```yaml
redteam:
  plugins:
    - hijacking
    - system-prompt-override
  strategies:
    - jailbreak
    - prompt-injection
    - jailbreak:composite
```

## T7: Misaligned & Deceptive Behaviors (owasp:agentic:t07)

AI agents may execute harmful or disallowed actions by exploiting reasoning and producing deceptive responses to meet their objectives.

### Agentic Context

Misaligned behaviors occur when agents:

- **Bypass constraints**: Prioritizing goal achievement over ethical or regulatory limits
- **Employ deception**: Strategically evading safety mechanisms while appearing compliant
- **Self-preserve**: Manipulating availability targets to prevent shutdown

### Attack Scenarios

- A stock trading AI bypasses regulatory constraints by prioritizing profitability
- An AI agent claims to have a vision impairment to get a human to solve a CAPTCHA
- Goal-driven decision-making that interprets abort commands as obstacles

### Testing Strategy

```yaml
redteam:
  plugins:
    - contracts
    - goal-misalignment
    - excessive-agency
  strategies:
    - jailbreak
    - crescendo
```

## T8: Repudiation & Untraceability (owasp:agentic:t08)

Occurs when actions performed by AI agents cannot be traced back or accounted for due to insufficient logging or transparency in decision-making processes.

### Agentic Context

Agentic AI challenges traceability because of:

- **Multiple reasoning pathways**: Often parallel and complex
- **Opaque decision-making**: Difficulty reconstructing agent behaviors
- **Autonomous operation**: Actions taken without immediate human oversight

### Attack Scenarios

- Financial transaction obfuscation: Manipulating records to hide unauthorized transactions
- Security system evasion: Crafting interactions with minimal logging
- Compliance violation concealment: Exploiting logging failures to avoid regulatory verification

### Testing Strategy

```yaml
redteam:
  plugins:
    - debug-access
    - excessive-agency
```

## T9: Identity Spoofing & Impersonation (owasp:agentic:t09)

Attackers exploit authentication mechanisms to impersonate AI agents or human users, enabling unauthorized actions under false identities.

### Agentic Context

Identity threats in agentic systems include:

- **Agent impersonation**: Mimicking trusted agents in multi-agent systems
- **User impersonation**: Acting on behalf of legitimate users through compromised agents
- **Cross-platform spoofing**: Dynamically altering identity across authentication contexts

### Attack Scenarios

- Injecting prompts to make agents send malicious emails as legitimate users
- Compromising HR agents to create fraudulent user accounts
- Behavioral mimicry attacks where rogue agents appear as trusted entities

### Testing Strategy

```yaml
redteam:
  plugins:
    - imitation
    - cross-session-leak
    - pii:session
```

## T10: Overwhelming Human in the Loop (owasp:agentic:t10)

This threat targets systems with human oversight, aiming to exploit human cognitive limitations or compromise interaction frameworks.

### Agentic Context

As agentic AI scales, human oversight faces challenges:

- **Cognitive overload**: Excessive intervention requests causing decision fatigue
- **Trust mechanism subversion**: Degrading human confidence in AI decisions
- **Rushed approvals**: Reduced scrutiny leading to security bypasses

### Attack Scenarios

- Introducing artificial decision contexts that obscure critical information
- Overwhelming reviewers with excessive tasks to induce rushed approvals
- Gradually degrading AI-human trust through introduced inconsistencies

### Testing Strategy

```yaml
redteam:
  plugins:
    - overreliance
    - excessive-agency
```

## T11: Unexpected RCE and Code Attacks (owasp:agentic:t11)

Attackers exploit AI-generated code execution to inject malicious code, trigger unintended behaviors, or execute unauthorized scripts.

### Agentic Context

Agentic AI with function-calling capabilities creates new attack vectors:

- **Direct code execution**: AI-generated code runs with elevated privileges
- **Sandbox escapes**: Exploiting execution environments
- **Linguistic ambiguities**: Crafting ambiguous commands that exfiltrate data

### Attack Scenarios

- DevOps agent compromise: Generating Terraform scripts with hidden commands
- Workflow engine exploitation: Executing AI-generated scripts with embedded backdoors
- Exploiting linguistic vulnerabilities to craft data exfiltration commands

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

## T12: Agent Communication Poisoning (owasp:agentic:t12)

Attackers manipulate communication channels between AI agents to spread false information, disrupt workflows, or influence decision-making.

### Agentic Context

Multi-agent systems are vulnerable because:

- **Distributed collaboration**: Complex inter-agent dependencies
- **Trust assumptions**: Implicit trust between agents
- **Cascading effects**: Misinformation spreads across the agent network

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
  strategies:
    - prompt-injection
```

## T13: Rogue Agents in Multi-Agent Systems (owasp:agentic:t13)

Malicious or compromised AI agents operate outside normal monitoring boundaries, executing unauthorized actions or exfiltrating data.

### Agentic Context

Rogue agents can:

- **Exploit trust mechanisms**: Operating undetected within multi-agent workflows
- **Persist in systems**: Remaining embedded in workflows unnoticed
- **Coordinate attacks**: Multiple rogue agents acting together

### Attack Scenarios

- Malicious workflow injection: Impersonating financial approval agents
- Orchestration hijacking: Routing fraudulent transactions through lower-privilege agents
- Coordinated agent flooding: Overwhelming computing resources simultaneously

### Testing Strategy

```yaml
redteam:
  plugins:
    - excessive-agency
    - hijacking
    - rbac
  strategies:
    - jailbreak
```

## T14: Human Attacks on Multi-Agent Systems (owasp:agentic:t14)

Adversaries exploit inter-agent delegation, trust relationships, and workflow dependencies to escalate privileges or manipulate AI-driven operations.

### Agentic Context

Multi-agent architectures create vulnerabilities through:

- **Delegation chains**: Trust relationships between agents
- **Workflow dependencies**: Complex task handoffs
- **Distributed authorization**: Fragmented approval processes

### Attack Scenarios

- Coordinated privilege escalation via multi-agent impersonation
- Agent delegation loops for repeated privilege escalation
- Cross-agent approval forgery exploiting authentication inconsistencies

### Testing Strategy

```yaml
redteam:
  plugins:
    - indirect-prompt-injection
    - hijacking
    - excessive-agency
  strategies:
    - jailbreak
    - prompt-injection
```

## T15: Human Manipulation (owasp:agentic:t15)

Attackers exploit user trust in AI agents to influence human decision-making without users realizing they are being misled.

### Agentic Context

The trust relationship with conversational agents:

- **Reduces skepticism**: Users rely on agent responses without verification
- **Enables social engineering**: Attackers coerce agents to manipulate users
- **Enables covert actions**: Agents can take harmful actions while appearing helpful

### Attack Scenarios

- AI-powered invoice fraud: Replacing legitimate vendor details with attacker accounts
- AI-driven phishing: Generating deceptive messages with malicious links
- Misinformation campaigns: Spreading false information through trusted agent interfaces

### Testing Strategy

```yaml
redteam:
  plugins:
    - imitation
    - harmful:misinformation-disinformation
    - overreliance
  strategies:
    - crescendo
```

## Relationship to OWASP LLM Top 10

The OWASP Agentic AI threats extend and complement the OWASP LLM Top 10:

| Agentic Threat               | Related LLM Top 10                     |
| ---------------------------- | -------------------------------------- |
| T1: Memory Poisoning         | LLM04: Data and Model Poisoning        |
| T2: Tool Misuse              | LLM06: Excessive Agency                |
| T3: Privilege Compromise     | LLM06: Excessive Agency                |
| T4: Resource Overload        | LLM10: Unbounded Consumption           |
| T5: Cascading Hallucination  | LLM09: Misinformation                  |
| T6: Goal Manipulation        | LLM01: Prompt Injection                |
| T11: RCE and Code Attacks    | LLM01, LLM05: Insecure Output Handling |
| T12: Communication Poisoning | LLM04: Data and Model Poisoning        |

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

The OWASP Agentic AI framework is rapidly evolving as agentic systems become more prevalent. Regular testing with Promptfoo helps ensure your AI agents remain secure against these emerging threats.

To learn more about red teaming agents, see:

- [How to Red Team LLM Agents](/docs/red-team/agents/)
- [Introduction to LLM Red Teaming](/docs/red-team/)
- [Red Team Configuration](/docs/red-team/configuration/)

## Additional Resources

- [OWASP Agentic Security Initiative](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [OWASP LLM Top 10](/docs/red-team/owasp-llm-top-10/)
- [OWASP API Security Top 10](/docs/red-team/owasp-api-top-10/)
