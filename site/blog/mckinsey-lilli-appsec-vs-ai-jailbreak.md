---
title: "McKinsey's Lilli Looks More Like an API Security Failure Than a Model Jailbreak"
description: 'Public reporting points to exposed API surface, unsafe SQL construction, and broken object-level authorization. The AI layer changed the blast radius.'
image: /img/blog/mckinsey-lilli-appsec/hero.jpg
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

McKinsey's Lilli looks, on the public record, like an application-security incident that reached an AI system, not a model jailbreak. [CodeWall's March 9, 2026 writeup](https://codewall.ai/blog/how-we-hacked-mckinseys-ai-platform) says its autonomous agent found exposed API documentation, unauthenticated endpoints, a SQL injection condition, and cross-user access. McKinsey told [The Register on March 9, 2026](https://www.theregister.com/2026/03/09/mckinsey_ai_chatbot_hacked/) that it fixed the issues within hours and that a third-party forensic investigation found no evidence that client data or client confidential information were accessed by the researcher or any other unauthorized third party.

The exact payloads were not published, so the public record does not independently prove every reported row count or every step of exploitation. It does, however, support the shape of the incident. The initial foothold appears to have been a familiar AppSec chain: exposed API surface, missing authentication, unsafe SQL construction, and broken object-level authorization.

The architectural issue is straightforward. If prompts, routing rules, and retrieval settings live as mutable application data, then database write access can change model behavior without a code deploy. Much of what gets called AI security is still software security, data security, and configuration governance.

<!-- truncate -->

## The reported chain

<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1.25rem',
    alignItems: 'start',
    margin: '1rem 0 1.25rem',
  }}
>
  <div>
    <p>According to CodeWall, the chain began with public API documentation and a set of endpoints that did not require authentication. One of those endpoints allegedly wrote search data into the database.</p>
    <p>CodeWall says ordinary JSON values were parameterized, but attacker-controlled JSON keys or identifiers were still concatenated into SQL syntax. OWASP's <a href="https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html">SQL Injection Prevention Cheat Sheet</a> makes the underlying point directly: table names, column names, and sort-order indicators are not protected the same way bind variables protect values. Claroty's research on <a href="https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf">JSON-based SQL used to bypass WAFs</a> and NVD's writeup for <a href="https://nvd.nist.gov/vuln/detail/CVE-2026-25544">CVE-2026-25544 in Payload CMS</a> show why this pattern is plausible rather than exotic.</p>
  </div>
  <div>
    <img
      src="/img/blog/mckinsey-lilli-appsec/attack-chain.svg"
      alt="Compact diagram showing the AppSec chain on the left and the AI-layer impact on the right"
      style={{ width: '100%', height: 'auto', margin: 0 }}
    />
  </div>
</div>

CodeWall also says the agent found cross-user access after the SQLi step. OWASP's current term for that pattern is **BOLA**, broken object-level authorization: the application accepts an object identifier and returns a record without verifying that the caller is allowed to see it. Older writeups often use the term IDOR (insecure direct object reference) for the same class of failure.

Because CodeWall did not publish the exact payloads, the public cannot reconstruct each query or iteration step by step. It can still reconstruct the class of bug: public routes, backend injection, and missing object-level authorization.

## Why the AI layer changed the impact

The AI-specific part was not the entry point. It was the blast radius. If the same backend stored prompts, routing rules, retrieval metadata, and user history, then backend access reached the system that shaped Lilli's answers.

That changes the meaning of a database compromise. A write can become a prompt change. A metadata edit can change what the system retrieves. A permissions flaw can let the assistant synthesize another employee's history into a normal-looking response. The model does not need to be tricked in the usual jailbreak sense if the surrounding system feeds it altered instructions, altered context, or altered permissions.

This is why the incident mattered beyond McKinsey. The more enterprise assistants are built as thin layers over ordinary web APIs, databases, and access-control systems, the more their failures will follow ordinary software patterns. McKinsey has described Lilli as a firmwide system; in public case studies, it said [72 percent of the firm was active on the platform and that Lilli handled more than 500,000 prompts a month](https://www.mckinsey.com/capabilities/mckinsey-digital/how-we-help-clients/rewiring-the-way-mckinsey-works-with-lilli), and that it had [answered more than 4.5 million queries over more than 200,000 documents](https://www.mckinsey.com/industries/financial-services/our-insights/insurance-blog/the-potential-of-gen-ai-in-insurance-six-traits-of-frontrunners).

## What teams should audit

The practical lesson is to audit the ordinary control points that determine what the assistant can see, write, and retrieve:

- public and undocumented routes that bypass standard authentication and authorization middleware
- SQL or ORM paths that treat request keys, JSON paths, field names, or sort parameters as dynamic identifiers
- BOLA coverage for assistants that can read internal knowledge, employee records, or client-linked objects
- prompts, routing rules, retrieval policy, and access-control metadata stored as mutable rows instead of governed configuration

## Bottom line

The easy mistake is to classify incidents like this as model failures because the model is what users see. The more useful framing is simpler: the model became the interface to a compromised application.

As more enterprise assistants store prompts, retrieval policy, and user context in ordinary backend systems, more "AI incidents" will start the same way. They will begin as familiar software bugs and end as changes in model behavior.
