---
sidebar_label: Excessive agency in LLMs
image: /img/blog/excessive-agency/detecting-excessive-agency.svg
date: 2024-10-08
---

# Understanding Excessive Agency in LLMs

**Excessive agency** in LLMs is a broad security risk where AI systems can do more than they should. This happens when they're given too much access or power. There are three main types:

1. **Too many features**: LLMs can use tools they don't need
2. **Too much access**: AI gets unnecessary permissions to backend systems
3. **Too much freedom**: LLMs make decisions without human checks

This is different from insecure output handling. It's about what the LLM can **do**, not just what it says.

Example: A customer service chatbot that can read customer info is fine. But if it can also change or delete records, that's excessive agency.

The [OWASP Top 10](https://genai.owasp.org/llmrisk/llm08-excessive-agency/) for LLM Apps lists this as a major concern. To fix it, developers need to carefully limit what their AI can do.

<!-- truncate -->

## What causes excessive agency?

Excessive agency in LLMs often stems from well-intentioned but poorly implemented features. This vulnerability type arises when AI systems are granted broader capabilities or access than necessary for their intended functions.

### Common Examples

Excessive agency arises in a handful of ways, but there are a few common patterns.

![excessive agency examples](/img/blog/excessive-agency/excessive-agency-examples.svg)

- **Overreaching tools**: Most LLM providers have first-class support for ["tools" or functions](https://platform.openai.com/docs/guides/function-calling), which is just a fancy way of saying "APIs that are exposed to the LLM".

  These APIs frequently include unnecessary functionality. For example, document summarization tool might also have edit and delete capabilities, expanding the potential attack surface.

- **Insecure APIs**: LLMs cannot be trusted with access to backend systems. We often see IDOR-style vulnerabilities where an LLM can make arbitrary data references.

- **Excessive database privileges**: LLM agents often connect to databases with more permissions than required.

- **Privileged account misuse**: Using high-level credentials for routine tasks creates unnecessary exposure. A support chatbot shouldn't access sensitive employee data with admin-level permissions.

- **Development artifacts**: Test or debug features meant may accidentally remain in production environments. Even if they're not explicitly mentioned in prompts, they can be invoked.

These scenarios share a common thread: granting LLMs more power than their core tasks demand.

Developers must carefully consider the principle of least privilege when integrating LLMs into their systems. By limiting access and functionality to only what's essential, they can significantly reduce the risk of excessive agency vulnerabilities.

## Why is excessive agency a problem?

Excessive agency in LLMs poses significant risks across security and business domains.

### Security Risks

**Unauthorized data access**: LLMs with excessive permissions may retrieve and expose sensitive information beyond their intended scope. Depending on your application, this could include proprietary company info or documents (e.g. in a RAG system).

**Remote execution**: Attackers exploiting excessive agency could potentially run arbitrary functions. This risk is amplified in environments where LLMs have meaningful system access, which is more likely as companies begin to explore agentic systems.

**Privacy breaches**: Overly-permissioned AI assistants might inadvertently disclose private user information in responses. Such leaks not only erode user trust but can also violate data protection regulations like GDPR or CCPA.

### Business Risks

**Financial loss**: LLMs with direct access to business systems could be manipulated.

**Reputational damage**: An AI acting inappropriately or leaking confidential information can severely impact a company's image. Rebuilding trust after breaches is costly and time-consuming.

**Operational disruptions**: LLMs with excessive admin privileges might alter critical configurations or delete important data.

**Legal liabilities**: Companies may face lawsuits if their AI systems cause harm due to excessive permissions or improper access control, especially in regulated industries like healthcare or finance.

The insidious nature of excessive agency means vulnerabilities can exist undetected for extended periods before exploitation. This underscores the importance of regular security audits and continuous monitoring of LLM activities.

## Preventing Excessive Agency

Mitigating excessive agency requires work at all stages of LLM development and deployment.

### Limiting LLM Capabilities

Start by constraining the LLM's operational scope:

- **Minimize tool exposure**: Only integrate essential tools and remove any unnecessary functionalities.
- **Granular function design**: Replace broad, open-ended functions with narrowly-defined, purpose-specific ones.
- **Custom integrations**: Develop tailored APIs instead of relying on general-purpose interfaces.

Consider an LLM-powered code assistant. Rather than granting it full repository access, create an internal API that only allows read operations on specific files or directories.

### Implementing Access Controls

Enforce strict access management, so even when someone comes along and jailbreaks your app, they can't do any damage.

- **Segmented accounts**: Utilize distinct, limited-privilege accounts for each LLM function.
- **Contextual permissions**: Implement dynamic access rights based on the current user's scope and needs.
- **Fine-grained backend controls**: Apply detailed access policies on all connected systems.

For instance, a support chatbot should operate with credentials that only permit access to data relevant to the customer it's currently assisting.

### Adding Safeguards

There's more you can do to limit downside risk from excessive agency vulnerabilities.

1. **Human oversight**: Require manual approval for high-stakes actions.

2. **Throttling**: Rate limit API calls to slow down exploration and attacks.

3. **Robust monitoring**: Use logging tools to detect anomalous LLM behavior patterns.

4. **Input & output sanitization**: Moderate inputs and outputs to prevent unintended actions.

These layers of protection serve as a crucial safety net, capturing issues that might evade primary defenses.

Preventing excessive agency requires constant vigilance. When expanding features or integrating new systems, always question: "What's the minimum level of access this LLM needs to fulfill its role?" Then, provide exactly that — nothing more.

## Detecting Excessive Agency Issues

Identifying excessive agency problems requires proactive monitoring and rigorous testing. Passive safeguards alone are insufficient.

![detecting excessive agency](/img/blog/excessive-agency/detecting-excessive-agency.svg)

### Testing Approaches

**Challenge your system's boundaries**. [Red team](/docs/red-team/) your system with inputs designed to push the AI beyond its intended limits. Focus on these key areas:

1. **Unauthorized Access**: Unintended data access.

   - Broken Function Level Authorization (BFLA)
   - Broken Object Level Authorization (BOLA, similar to IDOR)
   - Unauthorized data access or manipulation

2. **Manipulation and Injection**: Ways to trick the LLM into doing things.

   - Prompt injection and extraction
   - Indirect prompt injection through trusted data sources

3. **Scope and Capability Expansion**: Attempts to trigger actions beyond the LLM's intended scope.

   - Unauthorized tool or API usage
   - Execution of restricted operations or commands
   - Accessing or modifying resources outside the authorized scope

[Automated tools](/docs/red-team/) can stress-test your system with thousands of diverse inputs and uncover edge cases that human testers might overlook.

LLMs are particularly susceptible to injections or jailbreaks that exploit scenarios within your application-level prompt. Be sure to include [**social engineering**-type attacks](https://www.cmu.edu/iso/aware/dont-take-the-bait/social-engineering.html#:~:text=Social%20engineering%20is%20the%20tactic,or%20giving%20away%20sensitive%20information.) in your test suite.

### Monitoring Strategies

**Log every AI action**, particularly interactions with external systems, to create a comprehensive audit trail.

Implement alerts for anomalous patterns:

- Unusual spikes in API calls
- Attempts at restricted operations
- Access to infrequently used database tables or APIs

Extend monitoring beyond the LLM itself. Scrutinize connected systems for unexpected data changes, atypical transaction patterns, or access attempts from unfamiliar sources.

Standard observability and security tools like [Datadog](https://www.datadoghq.com/) and [Sentry](https://sentry.io/) are often sufficient for this. You probably don't need a specialized AI tool for monitoring!

## What's next?

The future will be harder, not easier, when it comes to excessive agency. This is because generative AI applications are moving in the direction of increasing data access and agency. They'll also become more complex and prevalent in our daily lives.

If you're looking to test for excessive agency, our software can help. Check out the [LLM red teaming guide](/docs/red-team/) to get started, or [contact us](/contact/) for personalized assistance.
