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

McKinsey has described Lilli as a large internal knowledge and synthesis system. In one 2024 case study, it said [72 percent of the firm was active on the platform and that Lilli handled more than 500,000 prompts a month](https://www.mckinsey.com/capabilities/mckinsey-digital/how-we-help-clients/rewiring-the-way-mckinsey-works-with-lilli). In another, it said the system had [answered more than 4.5 million queries over more than 200,000 documents](https://www.mckinsey.com/industries/financial-services/our-insights/insurance-blog/the-potential-of-gen-ai-in-insurance-six-traits-of-frontrunners). That scale helps explain why CodeWall's writeup drew attention.

[CodeWall's March 9, 2026 writeup](https://codewall.ai/blog/how-we-hacked-mckinseys-ai-platform) says its autonomous agent found exposed API documentation, unauthenticated endpoints, a SQL injection condition, and cross-user access in Lilli. McKinsey told [The Register on March 9, 2026](https://www.theregister.com/2026/03/09/mckinsey_ai_chatbot_hacked/) that it fixed the issues within hours and that a third-party forensic investigation found no evidence that client data or client confidential information were accessed by the researcher or any other unauthorized third party.

The public record supports something narrower than the most dramatic reading of CodeWall's post. It supports a serious API and authorization incident. It does not publicly prove every reported row count or every step of exploitation. But if CodeWall's account is broadly accurate, the initial foothold was not a model exploit. It was a familiar AppSec chain: exposed API surface, missing authentication, unsafe SQL construction, and broken object-level authorization.

<!-- truncate -->

## The reported chain

A simplified version of the chain described in public reporting looks like this:

![Simplified attack chain showing public API exposure leading to backend compromise, shared AI control state, and visible changes in model behavior](/img/blog/mckinsey-lilli-appsec/attack-chain.svg)

According to CodeWall, the chain began with public API documentation and a set of endpoints that did not require authentication. One of those endpoints allegedly wrote search data into the database. The technically interesting part is not just that CodeWall reports SQL injection. It is where the untrusted input appears to have landed. CodeWall says the JSON values were parameterized safely, but attacker-controlled JSON keys or identifiers were still being concatenated into SQL syntax.

That detail matters because it is easy to defend values with bind variables and still make mistakes around identifiers. OWASP's [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) makes exactly that point: parts of SQL such as table names, column names, and sort-order indicators cannot be treated the same way as ordinary values and usually need redesign or strict allow-lists. Claroty's research on [JSON-based SQL used to bypass WAFs](https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf) and NVD's writeup for [CVE-2026-25544 in Payload CMS](https://nvd.nist.gov/vuln/detail/CVE-2026-25544) show why this is not just theoretical. JSON-shaped SQL paths have been a real blind spot.

CodeWall also says the agent found cross-user access after the SQLi step. OWASP's current term for that pattern is **BOLA**, broken object-level authorization. In plain terms, the system accepts an object identifier and returns data it should not return because it never checks whether the caller is allowed to see that object. Older writeups often use the term IDOR for the same class of failure.

That is enough to explain the initial compromise without reaching for a model-side exploit.

## Why the AI layer changed the impact

The first fix here belongs to AppSec, platform security, and backend engineering. If the compromise starts with exposed API surface, unsafe SQL construction, and BOLA, that is where ownership starts.

The AI lesson comes later, and it is architectural. If prompts, routing rules, and retrieval settings are stored as mutable application data, then database write access can change model behavior without a code deploy. That is what turns an ordinary backend compromise into an AI integrity problem.

If CodeWall's description is broadly accurate, the surrounding system may have been made to feed the model compromised instructions, compromised context, and compromised permissions. In that kind of design, a database write can become a prompt rewrite, a metadata change can alter retrieval, and a permissions flaw can let the system synthesize another employee's history into an otherwise ordinary-looking answer.

The model did not necessarily need to be tricked in the usual jailbreak sense. The system around it only needed to expose the wrong backend primitives.

That is the part many teams still miss when they talk about "AI security." A large share of AI security is still software security, data-plane security, and configuration governance. The difference is that once those layers fail, the compromise is expressed through the model's behavior.

## Bottom line

The most useful lesson from Lilli is not that AI introduced a new root cause. It is that AI systems inherit the security of the software and data planes around them.

If the public reconstruction is broadly correct, McKinsey's Lilli was not first compromised because of an AI-native weakness. It was compromised because a traditional API and backend security failure path appears to have reached a system whose prompts, retrieval state, and user data were too tightly coupled.

In the AI era, some of the most damaging AI incidents will still begin as ordinary software bugs.
