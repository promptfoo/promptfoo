---
title: "McKinsey's Lilli Story Was AppSec, Not a Jailbreak"
description: "CodeWall's Lilli writeup reads less like a model jailbreak and more like a classic API, SQLi, and authorization failure whose blast radius reached the AI layer."
image: /img/blog/mckinsey-lilli-appsec/hero.jpg
imageAlt: 'Red panda security analyst tracing an attack path from public APIs and databases into an internal AI control layer'
date: 2026-03-10
authors: [michael]
tags: [security-vulnerability, ai-security, owasp]
keywords:
  [
    McKinsey Lilli,
    CodeWall,
    AI security,
    application security,
    SQL injection,
    API security,
    BOLA,
    prompt integrity,
    RAG security,
  ]
---

The cleanest public reading of the [CodeWall writeup on McKinsey's Lilli](https://codewall.ai/blog/how-we-hacked-mckinseys-ai-platform) is not "the model got jailbroken." It is "a classic web and API compromise reached an AI system that had too much authority, too much shared state, and too little separation between its control plane and its data plane."

That distinction matters. If you call every high-impact AI incident an "AI vulnerability," you end up fixing the wrong layer.

Publicly, the confirmed record is narrower than the vendor narrative. CodeWall says its autonomous agent found exposed API documentation, unauthenticated endpoints, a SQL injection condition, and an IDOR-style authorization flaw. McKinsey told [The Register on March 9, 2026](https://www.theregister.com/2026/03/09/mckinsey_lilli_data_leak/) that it fixed the issues within hours and that a third-party forensic investigation found no evidence that client data or client confidential information were accessed by the researcher or any other unauthorized third party. That means the safest conclusion is not "all reported impact is proven." The safest conclusion is "the attack chain looks technically plausible, the exposed surfaces were serious enough to patch immediately, and the architecture created an AI-specific blast radius."

McKinsey has also publicly described Lilli as a major internal platform. In May 2025, it said [72 percent of the firm was active on Lilli and that the platform handled more than 500,000 prompts per month](https://www.mckinsey.com/capabilities/mckinsey-digital/our-insights/tech-forward/whats-next-for-ai-at-mckinsey). Earlier, in July 2024, it described Lilli as searching [more than 200,000 internal documents and handling 4.5 million queries each month](https://www.mckinsey.com/industries/financial-services/our-insights/insurance-mckinsey-from-how-to-wow-report). So this was never "just a chatbot."

<!-- truncate -->

## What appears to have happened

Based on [CodeWall's March 9, 2026 post](https://codewall.ai/blog/how-we-hacked-mckinseys-ai-platform), the likely sequence was:

1. Public API documentation exposed a large surface area, with some endpoints reportedly reachable without authentication.
2. One unauthenticated endpoint allegedly wrote search data into the database.
3. The input values were parameterized, but attacker-controlled JSON keys were reportedly concatenated into SQL.
4. Error messages reflected that malformed input back out, enabling iterative SQLi-style probing until live data came back.
5. A second authorization flaw then appears to have enabled cross-user access to search history.

That is not a model jailbreak. That is a familiar AppSec chain: exposed API surface, missing auth, unsafe query construction, verbose errors, and broken object-level authorization.

The interesting wrinkle is the shape of the injection. OWASP's [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) explicitly calls out that some SQL fragments, such as table names, column names, and sort-order indicators, cannot be protected with bind variables and must be redesigned or allow-listed. Claroty's research on [JSON-based SQL used to bypass WAFs](https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf) and NVD's writeup for [CVE-2026-25544 in Payload CMS](https://nvd.nist.gov/vuln/detail/CVE-2026-25544) both reinforce the same point: JSON-shaped SQL paths can sit outside the assumptions of older defenses and older mental models.

## My take: root cause was AppSec, blast radius was AI

This incident is useful precisely because it separates two things teams often blur together:

- The **entry point** appears to have been ordinary application security failure.
- The **impact layer** was AI-specific because the compromised backend reportedly touched prompts, model configs, retrieval metadata, and user interactions.

That is an important distinction for security programs. If the initial compromise came through unauthenticated API exposure and SQL construction mistakes, then the first owners are AppSec, platform security, and backend engineering. Not the model alignment team.

But once the same backend state controls retrieval, prompting, model configuration, and user-visible answers, a database compromise becomes more than a database compromise. It becomes an integrity problem for the AI's behavior itself.

That is the part many teams still underestimate. The AI layer is often not compromised through some magical "AI-only" exploit. It is compromised because the surrounding system lets ordinary bugs mutate what the AI sees, what it retrieves, and what it is instructed to do.

## The genuinely AI-specific lesson

If CodeWall's account is directionally right, the biggest architectural mistake was not the SQLi alone. It was storing high-trust AI control artifacts in the same operational path as lower-trust application data.

If prompts, retrieval metadata, model routing, file metadata, and user conversation state all live behind the same reachable database primitives, then:

- A database write can become a prompt rewrite.
- A metadata change can become retrieval poisoning.
- A permissions flaw can become cross-user data synthesis.
- A normal-seeming answer can become the exfiltration path.

That is why I would frame this as an **AI integrity** story, not an AI jailbreak story.

The model was not necessarily tricked. The system around it may have been made to lie.

## Three strong angles for the post

If you want to shape this article around a sharper opinion, I think there are three especially strong frames:

### 1. Stop calling every AI incident an AI vulnerability

This is the cleanest thesis. The initial foothold was not exotic. The public evidence points to API exposure, SQL injection, and broken authorization. Calling that an "AI hack" risks obscuring the fix. Security teams should be suspicious whenever "AI" becomes a marketing wrapper around old mistakes.

### 2. The real AI risk was prompt and retrieval integrity

This is the more strategic architecture angle. Once prompts, configs, and RAG state are mutable backend data, attackers do not need a code deploy to change how the system behaves. They just need database reachability. That should push teams to treat prompts and model routing as controlled assets, with versioning, approvals, audit trails, and integrity monitoring.

### 3. CodeWall is really pitching autonomous offensive security

CodeWall's own site describes the company as [an autonomous offensive security platform that maps attack surface, chains exploits, validates findings with proof-of-concept exploits, and ties them back to root cause](https://codewall.ai/). Read the McKinsey post through that lens and it doubles as a category thesis: scanners and annual pentests miss ugly chained bugs; agentic offense is supposed to find them continuously. That is a credible pitch, even if some of the larger impact numbers in the post should still be treated as CodeWall-reported rather than independently proven.

## Tools that actually help mitigate this

The right response is not "buy one AI security product." The right response is to stack ordinary AppSec controls with AI-specific integrity testing.

More specifically: no single tool category would have reliably caught this whole chain. You want four layers working together:

1. Code scanning for unsafe SQL construction and missing auth invariants
2. API runtime testing for exposed routes and authorization flaws
3. API discovery and posture management for unauthenticated or shadow endpoints
4. Exploit-validated offensive testing for weird multi-step chains that static or default scans miss

### Traditional AppSec and API controls

- **Code scanning for dynamic SQL and auth invariants**: tools like [Semgrep](https://semgrep.dev/docs/learn/vulnerabilities/sql-injection) and [CodeQL](https://docs.github.com/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql) are useful here, but only if you go beyond the defaults. For a chain like this, add project-specific rules that flag request keys or JSON map keys flowing into raw SQL identifiers and enforce mandatory auth and role checks on every route.
- **DAST and human-in-the-loop API testing**: Burp, [OWASP ZAP](https://www.zaproxy.org/), and schema-aware fuzzing tools like [Schemathesis](https://schemathesis.io/) are still table stakes for exposed API surfaces and auth mistakes. But this is also a good reminder that odd runtime shapes, like attacker-controlled JSON keys becoming SQL syntax, often need manual or custom fuzzing rather than default scanner coverage alone.
- **API discovery and posture management**: if your team does not have a trustworthy inventory of public, internal, authenticated, unauthenticated, and deprecated endpoints, fix that first. A surprising number of AI breaches still start with "we exposed a route we did not realize was reachable."
- **Exploit-validated offensive testing**: this is where agentic or human-led offensive testing earns its keep. The problem is not just finding one bug. The problem is chaining missing auth, odd injection behavior, verbose errors, and broken object-level authorization into a working path.
- **Authorization testing**: OWASP's [API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) should be mandatory reading for any team shipping internal AI assistants over sensitive data.
- **Database hardening**: suppress raw database errors, use least-privilege DB roles, split read and write paths, and keep attacker-controlled identifiers out of SQL syntax entirely.

### AI-specific controls

- **Prompt and config integrity**: prompts, model routing rules, and guardrail configs should live in versioned config management with change approval, not as loose mutable rows with weak auditability.
- **RAG access control at retrieval time**: enforce document authorization before context assembly. Do not ask the model to "respect permissions" after retrieval.
- **AI-assisted code review is a complement, not a replacement**: repository-aware security review agents can be useful for targeted audits of auth flows or dangerous data paths, but they do not remove the need for conventional SAST, DAST, and API posture tooling.
- **Promptfoo red teaming**: use Promptfoo to test the AI layer for [OWASP API risks](/docs/red-team/owasp-api-top-10/), [prompt extraction](/docs/red-team/plugins/prompt-extraction/), [RAG poisoning](/docs/red-team/plugins/rag-poisoning/), and [unauthorized data access via `pii:api-db`](/docs/red-team/plugins/pii/).

Here is a reasonable starting point for an internal enterprise assistant:

```yaml
redteam:
  purpose: 'Internal RAG assistant for employee knowledge search over confidential documents'
  plugins:
    - owasp:api:01
    - rbac
    - pii:api-db
    - prompt-extraction
    - rag-poisoning
```

Promptfoo can help validate whether an attacker who reaches the AI layer can extract prompts, poison retrieval, or access data they should not see. It is not a substitute for API security testing or SQLi detection. It is the layer you add after you remember that AI systems are still software systems.

## The bottom line

My one-line read is this: if the public reconstruction is directionally correct, McKinsey's Lilli was not first compromised because of an AI-native weakness. It was compromised because a traditional AppSec failure path appears to have reached an AI system whose prompts, retrieval state, and user data were too tightly coupled.

That is the uncomfortable lesson. In the AI era, the most dangerous "AI vulnerabilities" may still start life as ordinary software bugs.
