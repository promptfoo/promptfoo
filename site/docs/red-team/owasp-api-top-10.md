---
sidebar_position: 25
description: Red team LLM applications against OWASP API Security Top 10 vulnerabilities to protect AI systems from broken authorization, SSRF, and API-specific attacks
---

# OWASP API Security Top 10

The OWASP API Security Top 10 is a security awareness document that identifies the most critical security risks to APIs. While traditionally focused on REST and GraphQL APIs, these vulnerabilities are increasingly relevant for LLM applications as they often function as intelligent API layers that interact with databases, external services, and internal systems.

LLM applications that use function calling, tool usage, or agent architectures are particularly susceptible to API security issues, as the LLM acts as a dynamic interface between users and backend systems.

## API Security Risks for LLM Applications

The current OWASP API Security Top 10 (2023) includes:

1. [API1: Broken Object Level Authorization](#api1-broken-object-level-authorization-owaspapi01)
2. [API2: Broken Authentication](#api2-broken-authentication-owaspapi02)
3. [API3: Broken Object Property Level Authorization](#api3-broken-object-property-level-authorization-owaspapi03)
4. [API4: Unrestricted Resource Consumption](#api4-unrestricted-resource-consumption-owaspapi04)
5. [API5: Broken Function Level Authorization](#api5-broken-function-level-authorization-owaspapi05)
6. [API6: Unrestricted Access to Sensitive Business Flows](#api6-unrestricted-access-to-sensitive-business-flows-owaspapi06)
7. [API7: Server Side Request Forgery](#api7-server-side-request-forgery-owaspapi07)
8. [API8: Security Misconfiguration](#api8-security-misconfiguration-owaspapi08)
9. [API9: Improper Inventory Management](#api9-improper-inventory-management-owaspapi09)
10. [API10: Unsafe Consumption of APIs](#api10-unsafe-consumption-of-apis-owaspapi10)

## Why API Security Matters for LLMs

LLM applications with API access create unique security challenges:

- **Natural language interface**: Users can manipulate API calls through conversational prompts
- **Tool calling**: LLMs can invoke functions and APIs autonomously based on user input
- **Complex authorization**: Traditional API authorization may not account for LLM-mediated access
- **Indirect attacks**: Attackers can use prompt injection to manipulate API interactions

## Scanning for OWASP API Security Risks

Promptfoo helps identify API security vulnerabilities in LLM applications through red teaming:

```yaml
redteam:
  plugins:
    - owasp:api
  strategies:
    - jailbreak
    - prompt-injection
```

Or target specific API risks:

```yaml
redteam:
  plugins:
    - owasp:api:01 # Broken Object Level Authorization
    - owasp:api:05 # Broken Function Level Authorization
    - owasp:api:07 # Server Side Request Forgery
```

## API1: Broken Object Level Authorization (owasp:api:01)

Broken Object Level Authorization (BOLA), also known as Insecure Direct Object Reference (IDOR), occurs when an application fails to properly verify that a user is authorized to access a specific object. This is the most common and impactful API vulnerability.

### LLM Context

In LLM applications, BOLA vulnerabilities arise when:

- Users can manipulate the LLM to access other users' data
- The LLM accesses objects without proper authorization checks
- Prompt injection bypasses access control logic

### Testing Strategy

Test for BOLA vulnerabilities:

- **BOLA plugin**: Systematically tests for unauthorized object access
- **RBAC**: Verifies role-based access controls are enforced

Example configuration:

```yaml
redteam:
  plugins:
    - bola
    - rbac
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:01
```

## API2: Broken Authentication (owasp:api:02)

Broken Authentication vulnerabilities allow attackers to compromise authentication tokens or exploit implementation flaws to assume other users' identities.

### LLM Context

LLM applications with authentication issues may:

- Fail to verify user identity properly
- Allow session hijacking through prompt manipulation
- Incorrectly implement role-based access
- Leak authentication tokens or credentials

### Testing Strategy

Test for authentication vulnerabilities:

- **BFLA**: Tests for function-level authorization bypasses
- **RBAC**: Verifies authentication and role enforcement

Example configuration:

```yaml
redteam:
  plugins:
    - bfla
    - rbac
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:02
```

## API3: Broken Object Property Level Authorization (owasp:api:03)

This vulnerability combines excessive data exposure and mass assignment. It occurs when an API returns more data than necessary or allows users to modify object properties they shouldn't access.

### LLM Context

In LLM applications, this manifests as:

- Over-sharing of data in LLM responses
- Excessive agency in modifying system properties
- Failure to filter sensitive object properties

### Testing Strategy

Test for property-level authorization issues:

- **Excessive agency**: Tests for unauthorized modifications
- **Overreliance**: Checks for accepting invalid property changes

Example configuration:

```yaml
redteam:
  plugins:
    - excessive-agency
    - overreliance
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:03
```

## API4: Unrestricted Resource Consumption (owasp:api:04)

This vulnerability, formerly known as "Lack of Resources & Rate Limiting," occurs when APIs don't properly restrict resource consumption, leading to denial of service or excessive costs.

### LLM Context

LLM applications are particularly vulnerable to resource exhaustion:

- Expensive API calls triggered by user prompts
- Unlimited context window usage
- Excessive database queries
- Privacy leaks through session persistence

### Testing Strategy

Test for resource consumption vulnerabilities:

- **Privacy**: Tests for data persistence issues
- **PII plugins**: Checks for information leakage across requests

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:privacy
    - pii:api-db
    - pii:session
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:04
```

## API5: Broken Function Level Authorization (owasp:api:05)

Broken Function Level Authorization (BFLA) occurs when an application doesn't properly enforce access controls at the function level, allowing users to perform administrative or privileged actions.

### LLM Context

In LLM applications with tool calling or function execution:

- Users can invoke privileged functions through prompts
- The LLM executes administrative actions without authorization
- Role boundaries are not properly enforced

### Testing Strategy

Test for function-level authorization issues:

- **BFLA**: Systematically tests function authorization
- **BOLA**: Tests object-level authorization alongside function access
- **RBAC**: Verifies role-based function access controls

Example configuration:

```yaml
redteam:
  plugins:
    - bfla
    - bola
    - rbac
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:05
```

## API6: Unrestricted Access to Sensitive Business Flows (owasp:api:06)

This vulnerability occurs when APIs expose sensitive business workflows without proper controls, allowing attackers to abuse critical functionality.

### LLM Context

LLM applications may expose sensitive flows through:

- Natural language manipulation of business processes
- Misinformation about business rules or workflows
- Over-reliance on LLM decisions in critical flows

### Testing Strategy

Test for business flow vulnerabilities:

- **Misinformation**: Tests for manipulation of business logic
- **Overreliance**: Checks for blind trust in LLM outputs

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:misinformation-disinformation
    - overreliance
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:06
```

## API7: Server Side Request Forgery (owasp:api:07)

SSRF vulnerabilities occur when an API fetches a remote resource without validating the user-supplied URL, allowing attackers to access internal systems or perform unauthorized actions.

### LLM Context

LLM applications are particularly vulnerable to SSRF:

- LLMs can be tricked into making unauthorized requests
- Function calling may expose SSRF vectors
- Prompt injection can manipulate URL parameters

### Testing Strategy

Test for SSRF and injection vulnerabilities:

- **Shell injection**: Tests for command execution
- **SQL injection**: Tests for database manipulation

Example configuration:

```yaml
redteam:
  plugins:
    - shell-injection
    - sql-injection
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:07
```

## API8: Security Misconfiguration (owasp:api:08)

Security misconfiguration is a broad category covering improper security settings, default configurations, verbose error messages, and missing security patches.

### LLM Context

LLM applications commonly have misconfigurations:

- Exposed debugging information
- Overly permissive API access
- Leaked system prompts or configuration
- Privacy setting misconfigurations

### Testing Strategy

Test for misconfiguration issues:

- **Privacy**: Tests for data exposure through misconfigurations
- **PII plugins**: Checks for inadvertent data leakage

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:privacy
    - pii:api-db
    - pii:session
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:08
```

## API9: Improper Inventory Management (owasp:api:09)

This vulnerability occurs when organizations lack proper documentation and inventory of API endpoints, versions, and integrations, leading to unpatched or deprecated APIs remaining accessible.

### LLM Context

LLM applications with poor inventory management:

- Expose undocumented function calls or tools
- Provide specialized advice beyond intended scope
- Make assumptions about system capabilities

### Testing Strategy

Test for inventory management issues:

- **Specialized advice**: Tests for out-of-scope expertise
- **Overreliance**: Checks for unverified capabilities

Example configuration:

```yaml
redteam:
  plugins:
    - harmful:specialized-advice
    - overreliance
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:09
```

## API10: Unsafe Consumption of APIs (owasp:api:10)

This vulnerability occurs when applications trust data from third-party APIs without proper validation, leading to various attacks through compromised or malicious API responses.

### LLM Context

LLM applications consuming external APIs face risks:

- Using untrusted data in responses
- Exposing debug information from external APIs
- Leaking privacy information from external sources

### Testing Strategy

Test for unsafe API consumption:

- **Debug access**: Tests for exposed debugging information
- **Privacy**: Tests for data leakage from external sources

Example configuration:

```yaml
redteam:
  plugins:
    - debug-access
    - harmful:privacy
```

Or use the OWASP API shorthand:

```yaml
redteam:
  plugins:
    - owasp:api:10
```

## Comprehensive OWASP API Security Testing

For complete OWASP API Security Top 10 coverage:

```yaml
redteam:
  plugins:
    - owasp:api
  strategies:
    - jailbreak
    - prompt-injection
```

This configuration tests your LLM application against all OWASP API Security Top 10 risks.

## Integration with OWASP LLM Top 10

The OWASP API Security Top 10 and OWASP LLM Top 10 are complementary frameworks:

| API Security Risk               | Related LLM Risk                        |
| ------------------------------- | --------------------------------------- |
| API1: BOLA                      | LLM06: Excessive Agency                 |
| API5: BFLA                      | LLM06: Excessive Agency                 |
| API7: SSRF                      | LLM05: Improper Output Handling         |
| API8: Security Misconfiguration | LLM02: Sensitive Information Disclosure |

Test both frameworks together:

```yaml
redteam:
  plugins:
    - owasp:api
    - owasp:llm
  strategies:
    - jailbreak
    - prompt-injection
```

## LLM-Specific API Security Challenges

LLM applications introduce unique API security considerations:

### Natural Language as Attack Vector

Traditional APIs validate structured input (JSON, XML), but LLMs accept natural language, making input validation more complex.

### Autonomous Tool Usage

LLMs can chain multiple API calls autonomously, creating authorization challenges traditional APIs don't face.

### Context-Dependent Authorization

Authorization decisions may depend on conversation history, making session management critical.

### Indirect Injection Attacks

Attackers can manipulate API calls through prompt injection without directly accessing the API.

## Best Practices

When securing LLM applications against API vulnerabilities:

1. **Defense in depth**: Implement authorization at both the LLM and API layers
2. **Principle of least privilege**: Limit LLM access to only necessary APIs and functions
3. **Input validation**: Validate LLM outputs before passing to APIs
4. **Rate limiting**: Apply both token-based and API call rate limits
5. **Monitoring**: Log and monitor LLM-initiated API calls
6. **Testing**: Regularly test with both direct API calls and LLM-mediated access

## What's Next

API security for LLM applications is an evolving field as new attack patterns emerge. Regular testing with Promptfoo helps ensure your LLM applications maintain strong API security posture.

To learn more about setting up comprehensive AI red teaming, see [Introduction to LLM red teaming](/docs/red-team/) and [Configuration details](/docs/red-team/configuration/).

## Additional Resources

- [OWASP API Security Project](https://owasp.org/www-project-api-security/)
- [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x00-header/)
- [API Security Best Practices](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
