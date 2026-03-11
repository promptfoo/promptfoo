---
title: 'The McKinsey Lilli Case Looks More Like API/AppSec Failure Than an AI Jailbreak'
description: "If CodeWall's account is broadly accurate, Lilli was reached through exposed APIs, unsafe SQL, and broken object-level authorization. The AI layer amplified the impact."
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

If CodeWall's account is broadly accurate, McKinsey's Lilli was not first compromised by a model jailbreak. The initial foothold appears to have been a familiar AppSec chain: exposed API documentation, unauthenticated endpoints, SQL injection, and cross-user access. The AI-specific risk came later, because the same backend reportedly held prompts, model configurations, retrieval metadata, and user history.

That distinction matters. If you label every high-impact AI incident an "AI vulnerability," you end up fixing the wrong layer. In this case, the public reporting points first to API and backend control failures, then to an architecture that let those failures reach the AI control plane.

The public record is narrower than CodeWall's narrative. [CodeWall's March 9, 2026 writeup](https://codewall.ai/blog/how-we-hacked-mckinseys-ai-platform) lays out the chain and the claimed scope. McKinsey told [The Register on March 9, 2026](https://www.theregister.com/2026/03/09/mckinsey_ai_chatbot_hacked/) that it fixed the issues within hours and that a third-party forensic investigation found no evidence that client data or client confidential information were accessed by the researcher or any other unauthorized third party. So the defensible conclusion is not that every reported impact claim is proven. It is that serious API and authorization issues were found, patched quickly, and attached to a system where backend compromise could influence AI behavior.

McKinsey has described Lilli as a firmwide system rather than a novelty chatbot. In public case studies, it said Lilli was used by 72 percent of the firm, handled more than 500,000 prompts a month, had answered more than 4.5 million queries in total, and searched more than 200,000 internal documents. That scale is what turned an ordinary AppSec chain into a consequential AI story.

<!-- truncate -->

## What CodeWall claims, and what McKinsey has confirmed

The published reporting supports a narrower set of conclusions than the full CodeWall post.

- **According to CodeWall**, public API documentation exposed a large surface area, including 22 endpoints that allegedly did not require authentication.
- **According to CodeWall**, one unauthenticated endpoint wrote search data into the database.
- **According to CodeWall**, the unusual SQLi condition was not attacker-controlled values but attacker-controlled JSON keys or identifiers reaching SQL syntax.
- **According to CodeWall**, a second flaw enabled cross-user access. The cleanest current term for that is **BOLA**, or broken object-level authorization, though many practitioners will still recognize it as IDOR.
- **McKinsey has publicly confirmed** fast remediation and said its forensic review found no evidence of unauthorized access to client data or client confidential information.
- **The exact prompts and payloads are still not public**. [The Register](https://www.theregister.com/2026/03/09/mckinsey_ai_chatbot_hacked/) reported that CodeWall's CEO declined to disclose them publicly.

That leaves the attack chain technically plausible but not fully independently reconstructed from public material.

The most interesting technical detail is the shape of the injection. OWASP's [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) notes that some SQL fragments, such as table names, column names, and sort-order indicators, cannot be handled the same way as values with bind variables; they have to be redesigned or allow-listed. Claroty's research on [JSON-based SQL used to bypass WAFs](https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf) and NVD's writeup for [CVE-2026-25544 in Payload CMS](https://nvd.nist.gov/vuln/detail/CVE-2026-25544) point to the same lesson: user-controlled JSON keys and identifiers can reach SQL syntax in ways older defensive assumptions miss.

## Root cause was AppSec; the blast radius was AI

This is the key distinction, because it tells you who owns the first fix. If the compromise starts with exposed API surface, unsafe SQL construction, and BOLA, ownership begins with AppSec, platform security, and backend engineering.

Where the AI layer matters is the mechanism of downstream compromise. If prompts, routing rules, and retrieval metadata live as mutable application data, then database write access can change model behavior without a code deploy. That is the concrete architectural lesson in the Lilli story.

If CodeWall's description is broadly accurate, the surrounding system may have been made to feed the model compromised instructions, compromised context, and compromised permissions. In that design:

- a database write can become a prompt rewrite
- a metadata change can become retrieval poisoning
- a permissions flaw can become cross-user data synthesis
- a normal-looking answer can become the exfiltration path

That is why this reads less like a jailbreak than an AI control-plane problem created by ordinary backend weaknesses.

## Five questions every enterprise assistant team should answer

This is where security leaders and engineering teams should land. Not on a vendor stack, but on a short audit list:

1. Do any routes bypass standardized authentication middleware or role checks?
2. Can request keys, metadata fields, or field names reach raw SQL or dynamic identifiers?
3. Do we test BOLA on assistants over internal data, not just prompt injection and safety filters?
4. Are prompts, routing rules, and retrieval policy governed like code, with versioning and approvals, or left as loose rows in application tables?
5. Is document authorization enforced before retrieval, rather than delegated to the model after retrieval?

If your team cannot answer those five questions quickly and confidently, the Lilli story should feel uncomfortably familiar.

## The bottom line

The right lesson from Lilli is not that AI created a new root cause. It is that AI systems inherit the security of the software and data planes around them.

If the public reconstruction is broadly correct, McKinsey's Lilli was not first compromised because of an AI-native weakness. It was compromised because a traditional AppSec failure path appears to have reached an AI system whose prompts, retrieval state, and user data were too tightly coupled.

In the AI era, some of the most damaging "AI incidents" will still begin as ordinary software bugs.
