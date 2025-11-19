---
sidebar_position: 24
description: Red team LLM applications using MITRE ATLAS adversarial ML tactics to protect AI systems from reconnaissance, exfiltration, and impact attacks
---

# MITRE ATLAS

MITRE ATLAS (Adversarial Threat Landscape for Artificial-Intelligence Systems) is a knowledge base of adversary tactics and techniques based on real-world observations of attacks against machine learning systems. Modeled after the MITRE ATT&CK framework, ATLAS provides a structured way to understand and defend against threats specific to AI and ML systems.

ATLAS organizes adversarial techniques into tactics that represent the adversary's objectives during an attack. For LLM applications, these tactics help identify potential attack vectors throughout the AI system lifecycle.

## MITRE ATLAS Tactics

ATLAS organizes adversarial ML techniques into the following tactics:

1. [Reconnaissance](#reconnaissance-mitre-atlas-reconnaissance) - Gathering information about the ML system
2. [Resource Development](#resource-development-mitre-atlas-resource-development) - Establishing resources to support targeting
3. [Initial Access](#initial-access-mitre-atlas-initial-access) - Gaining entry into the ML system
4. [ML Attack Staging](#ml-attack-staging-mitre-atlas-ml-attack-staging) - Preparing and positioning attacks against the ML model
5. [Exfiltration](#exfiltration-mitre-atlas-exfiltration) - Stealing data or model information
6. [Impact](#impact-mitre-atlas-impact) - Disrupting, degrading, or destroying the ML system

## Scanning for MITRE ATLAS Threats

Promptfoo helps identify ATLAS-aligned vulnerabilities through comprehensive red teaming. To set up ATLAS scanning through the Promptfoo UI, select the MITRE ATLAS option or configure it directly:

```yaml
redteam:
  plugins:
    - mitre:atlas
  strategies:
    - jailbreak
    - prompt-injection
```

Or target specific tactics:

```yaml
redteam:
  plugins:
    - mitre:atlas:reconnaissance
    - mitre:atlas:exfiltration
    - mitre:atlas:impact
```

## Reconnaissance (mitre:atlas:reconnaissance) {#reconnaissance-mitre-atlas-reconnaissance}

Reconnaissance involves adversaries gathering information about the ML system to plan subsequent attacks. For LLM applications, this includes discovering system capabilities, extracting prompts, understanding access controls, and identifying competitive intelligence.

### Threat Landscape

Attackers use reconnaissance to:

- Discover available functions and tools
- Extract system prompts and instructions
- Map role-based access controls
- Identify competitive advantages or proprietary approaches
- Understand data sources and knowledge bases

### Testing Strategy

Test for reconnaissance vulnerabilities:

- **Competitors**: Verify the system doesn't reveal competitive information
- **Policy**: Test that internal policies and business rules aren't disclosed
- **Prompt extraction**: Ensure system prompts can't be extracted
- **RBAC**: Verify role boundaries aren't easily enumerable

Example configuration:

```yaml
redteam:
  language: ['en', 'es', 'fr'] # Test in multiple languages
  plugins:
    - competitors
    - policy
    - prompt-extraction
    - rbac
  strategies:
    - jailbreak
```

Or use the ATLAS shorthand:

```yaml
redteam:
  plugins:
    - mitre:atlas:reconnaissance
```

## Resource Development (mitre:atlas:resource-development) {#resource-development-mitre-atlas-resource-development}

Resource Development involves adversaries creating, purchasing, or compromising resources to support targeting. This includes developing malicious prompts, acquiring tools, or obtaining infrastructure to launch attacks against ML systems.

### Threat Landscape

Attackers develop resources to:

- Create harmful content generation requests
- Develop prompts for illegal activities
- Build tools to generate weapons or dangerous materials

### Testing Strategy

Test for vulnerability to resource development attacks:

- **Cybercrime**: Verify the system doesn't assist with malicious activities
- **Illegal drugs**: Ensure the system refuses drug-related requests
- **Indiscriminate weapons**: Test that weapon creation requests are blocked

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:cybercrime
    - harmful:illegal-drugs
    - harmful:indiscriminate-weapons
```

Or use the ATLAS shorthand:

```yaml
redteam:
  plugins:
    - mitre:atlas:resource-development
```

## Initial Access (mitre:atlas:initial-access) {#initial-access-mitre-atlas-initial-access}

Initial Access consists of techniques that adversaries use to gain their initial foothold in the ML system. For LLM applications, this often involves exploiting input validation weaknesses or using prompt injection to bypass security controls.

### Threat Landscape

Attackers gain initial access through:

- SQL injection and shell injection attacks
- Server-side request forgery (SSRF)
- Debug access endpoints
- Cybercrime techniques
- Prompt injection and obfuscation

### Testing Strategy

Test for initial access vulnerabilities:

- **Debug access**: Verify debug endpoints aren't exposed
- **Cybercrime**: Test for assistance with unauthorized access techniques
- **Shell injection**: Ensure commands can't be executed
- **SQL injection**: Verify database queries can't be manipulated
- **SSRF**: Test that the system doesn't make unauthorized requests

Example configuration:

```yaml
redteam:
  plugins:
    - debug-access
    - harmful:cybercrime
    - shell-injection
    - sql-injection
    - ssrf
  strategies:
    - base64
    - jailbreak
    - leetspeak
    - prompt-injection
    - rot13
```

Or use the ATLAS shorthand:

```yaml
redteam:
  plugins:
    - mitre:atlas:initial-access
```

## ML Attack Staging (mitre:atlas:ml-attack-staging) {#ml-attack-staging-mitre-atlas-ml-attack-staging}

ML Attack Staging involves techniques that adversaries use to prepare and position attacks specifically against the ML model itself. This includes poisoning inputs, manipulating model behavior, and exploiting ML-specific vulnerabilities.

### Threat Landscape

Attackers stage ML-specific attacks by:

- Injecting adversarial content through indirect means
- Smuggling malicious instructions using encoding
- Creating excessive agency scenarios
- Inducing hallucinations for exploitation
- Using multi-turn attacks to gradually compromise the model

### Testing Strategy

Test for ML attack staging vulnerabilities:

- **ASCII smuggling**: Verify hidden instructions can't bypass filters
- **Excessive agency**: Test that the model doesn't exceed intended capabilities
- **Hallucination**: Ensure false information can't be weaponized
- **Indirect prompt injection**: Check for vulnerability to poisoned context

Example configuration:

```yaml
redteam:
  plugins:
    - ascii-smuggling
    - excessive-agency
    - hallucination
    - indirect-prompt-injection
  strategies:
    - jailbreak
    - jailbreak:tree
```

Or use the ATLAS shorthand:

```yaml
redteam:
  plugins:
    - mitre:atlas:ml-attack-staging
```

## Exfiltration (mitre:atlas:exfiltration) {#exfiltration-mitre-atlas-exfiltration}

Exfiltration involves techniques that adversaries use to steal data, including personally identifiable information (PII), training data, proprietary prompts, or other sensitive information from the ML system.

### Threat Landscape

Attackers exfiltrate information by:

- Extracting PII from training data or context
- Stealing system prompts and instructions
- Accessing unauthorized databases or APIs
- Leaking information across user sessions
- Using encoding to bypass data loss prevention

### Testing Strategy

Test for exfiltration vulnerabilities:

- **ASCII smuggling**: Verify data can't be exfiltrated using encoding
- **Privacy**: Test for unauthorized disclosure of sensitive information
- **Indirect prompt injection**: Check for data exfiltration via poisoned inputs
- **PII plugins**: Comprehensively test for PII leakage
- **Prompt extraction**: Ensure system prompts can't be extracted

Example configuration:

```yaml
redteam:
  plugins:
    - ascii-smuggling
    - harmful:privacy
    - indirect-prompt-injection
    - pii:api-db
    - pii:direct
    - pii:session
    - pii:social
    - prompt-extraction
```

Or use the ATLAS shorthand:

```yaml
redteam:
  plugins:
    - mitre:atlas:exfiltration
```

## Impact (mitre:atlas:impact) {#impact-mitre-atlas-impact}

Impact consists of techniques that adversaries use to disrupt, degrade, or destroy the ML system or manipulate its outputs. For LLM applications, this includes hijacking the system's purpose, generating harmful content, causing it to imitate others, or taking excessive agency actions.

### Threat Landscape

Attackers create impact by:

- Hijacking the AI's intended purpose
- Generating harmful or inappropriate content
- Impersonating brands or individuals
- Causing the system to take unauthorized actions
- Using sophisticated multi-turn attacks

### Testing Strategy

Test for impact vulnerabilities:

- **Excessive agency**: Verify the system doesn't take unauthorized actions
- **Harmful content**: Test for generation of dangerous or offensive content
- **Hijacking**: Ensure the system maintains its intended purpose
- **Imitation**: Verify the system doesn't impersonate people or brands

Example configuration:

```yaml
redteam:
  plugins:
    - excessive-agency
    - harmful
    - hijacking
    - imitation
  strategies:
    - crescendo
```

Or use the ATLAS shorthand:

```yaml
redteam:
  plugins:
    - mitre:atlas:impact
```

## Comprehensive MITRE ATLAS Testing

For complete MITRE ATLAS threat coverage across all tactics:

```yaml
redteam:
  language: ['en', 'es', 'fr'] # Test in multiple languages
  plugins:
    - mitre:atlas
  strategies:
    - jailbreak
    - prompt-injection
    - base64
    - rot13
```

This configuration tests your AI system against all MITRE ATLAS tactics, providing comprehensive adversarial threat assessment.

## MITRE ATLAS vs MITRE ATT&CK

While MITRE ATT&CK focuses on traditional IT systems, MITRE ATLAS extends the framework to address ML-specific threats:

| Aspect         | MITRE ATT&CK              | MITRE ATLAS           |
| -------------- | ------------------------- | --------------------- |
| **Focus**      | IT systems, networks      | ML systems, AI models |
| **Techniques** | Traditional cyber attacks | ML-specific attacks   |
| **Targets**    | Servers, endpoints        | Models, training data |
| **Example**    | Credential dumping        | Model inversion       |

For LLM applications, both frameworks are relevant:

- Use **ATLAS** for ML-specific vulnerabilities (model extraction, prompt injection)
- Use **ATT&CK** principles for infrastructure security (API security, authentication)

## Integration with Other Frameworks

MITRE ATLAS complements other security frameworks:

- **OWASP LLM Top 10**: Maps ATLAS tactics to specific LLM vulnerabilities
- **NIST AI RMF**: ATLAS provides tactical detail for NIST's risk measures
- **ISO 42001**: ATLAS tactics inform security and robustness requirements
- **GDPR**: Exfiltration tactics relate to data protection requirements

You can combine ATLAS testing with other frameworks:

```yaml
redteam:
  plugins:
    - mitre:atlas
    - owasp:llm
    - nist:ai:measure
  strategies:
    - jailbreak
    - prompt-injection
```

## Best Practices for ATLAS-Based Red Teaming

When using MITRE ATLAS for LLM red teaming:

1. **Attack lifecycle**: Test across all tactics, not just initial access or impact
2. **Defense in depth**: Address vulnerabilities at multiple stages of the attack chain
3. **Realistic scenarios**: Combine tactics as adversaries would in real attacks
4. **Continuous testing**: Regularly test as new ATLAS techniques are documented
5. **Threat intelligence**: Stay updated on real-world attacks documented in ATLAS
6. **Purple teaming**: Use ATLAS as a common language between red and blue teams

## Real-World ATLAS Techniques for LLMs

MITRE ATLAS documents real-world attacks against ML systems. For LLMs, examples include:

- **AML.T0043 - Craft Adversarial Data**: Creating prompts designed to elicit harmful outputs
- **AML.T0051 - LLM Prompt Injection**: Manipulating LLM behavior through crafted inputs
- **AML.T0024 - Exfiltration via ML Inference API**: Extracting training data through queries
- **AML.T0020 - Poison Training Data**: Manipulating fine-tuning or RAG data sources

Promptfoo's plugins map to these specific ATLAS techniques, enabling targeted testing.

## What's Next

MITRE ATLAS is actively maintained and updated with new techniques as the threat landscape evolves. Regular testing with Promptfoo helps ensure your LLM applications remain protected against documented adversarial ML tactics.

To learn more about setting up comprehensive AI red teaming, see [Introduction to LLM red teaming](/docs/red-team/) and [Configuration details](/docs/red-team/configuration/).

## Additional Resources

- [MITRE ATLAS Official Website](https://atlas.mitre.org/)
- [ATLAS Matrix Navigator](https://atlas.mitre.org/matrices/ATLAS)
- [ATLAS Case Studies](https://atlas.mitre.org/studies)
- [ATLAS Tactics Overview](https://atlas.mitre.org/tactics)
