---
title: "McKinsey's Lilli Looks More Like an API Security Failure Than a Model Jailbreak"
description: 'Public reporting points to exposed API surface, unsafe SQL construction, and broken object-level authorization. The AI layer changed the blast radius.'
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

McKinsey's Lilli was, by McKinsey's own description, a large internal knowledge and synthesis system. It was used across the firm, handled more than 500,000 prompts a month, had answered more than 4.5 million queries in total, and searched more than 200,000 internal documents. That matters because the public debate around CodeWall's writeup has sometimes treated the incident as an AI jailbreak. Read more closely, it looks more like a conventional application security failure that happened to reach an AI system.

[CodeWall's March 9, 2026 writeup](https://codewall.ai/blog/how-we-hacked-mckinseys-ai-platform) says its autonomous agent found exposed API documentation, unauthenticated endpoints, a SQL injection condition, and cross-user access in Lilli. McKinsey told [The Register on March 9, 2026](https://www.theregister.com/2026/03/09/mckinsey_ai_chatbot_hacked/) that it fixed the issues within hours and that a third-party forensic investigation found no evidence that client data or client confidential information were accessed by the researcher or any other unauthorized third party.

That public record supports something narrower than the most dramatic reading of CodeWall's post. It supports a serious API and authorization incident. It does not publicly prove every reported row count or every step of exploitation. But if CodeWall's account is broadly accurate, the initial foothold was not a model exploit. It was an AppSec chain: exposed API surface, missing authentication, unsafe SQL construction, and broken object-level authorization.

<!-- truncate -->

## The reported chain

According to CodeWall, the agent began with public API documentation and found a set of endpoints that did not require authentication. One of those endpoints allegedly wrote search data into the database. The unusual part of the writeup is not the existence of SQL injection by itself. It is where the untrusted input appears to have landed. CodeWall says values were parameterized safely, but attacker-controlled JSON keys or identifiers were still being concatenated into SQL syntax.

That detail matters because it is easy to defend values with bind variables and still make mistakes around identifiers. OWASP's [SQL Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html) makes exactly that point: parts of SQL such as table names, column names, and sort-order indicators cannot be treated the same way as ordinary values and usually need redesign or strict allow-lists. Claroty's research on [JSON-based SQL used to bypass WAFs](https://claroty.com/team82/research/js-on-security-off-abusing-json-based-sql-to-bypass-waf) and NVD's writeup for [CVE-2026-25544 in Payload CMS](https://nvd.nist.gov/vuln/detail/CVE-2026-25544) show why this is not just theoretical. JSON-shaped SQL paths have been a real blind spot.

CodeWall also says the agent found cross-user access after the SQLi step. The cleanest current term for that is **BOLA**, broken object-level authorization. In plain terms, the system accepts an object identifier and returns data it should not return because it never properly checks whether the caller is allowed to see that object. Many people still use the older term IDOR, but the underlying failure is the same.

None of that requires a model jailbreak to explain it. It is an API and backend security story first.

## Why the AI layer changed the impact

The first fix here belongs to AppSec, platform security, and backend engineering. If the compromise starts with exposed API surface, unsafe SQL construction, and BOLA, that is where ownership starts too.

The AI lesson comes later, and it is architectural. If prompts, routing rules, and retrieval settings are stored as mutable application data, then database write access can change model behavior without a code deploy. That is what turns an ordinary backend compromise into an AI integrity problem.

If CodeWall's description is broadly accurate, the surrounding system may have been made to feed the model compromised instructions, compromised context, and compromised permissions. In that kind of design:

- a database write can become a prompt rewrite
- a metadata change can become retrieval poisoning
- a permissions flaw can become cross-user data synthesis
- a normal-looking answer can become the exfiltration path

The model did not necessarily need to be tricked in the usual jailbreak sense. The system around it only needed to expose the wrong backend primitives.

That is the part many teams still miss when they talk about "AI security." A large share of AI security is still software security, data-plane security, and configuration governance. The difference is that once those layers fail, the damage is expressed through an AI system's behavior. The output now carries the compromise.

## Bottom line

The most useful lesson from Lilli is not that AI introduced a new root cause. It is that AI systems inherit the security of the software and data planes around them.

If the public reconstruction is broadly correct, McKinsey's Lilli was not first compromised because of an AI-native weakness. It was compromised because a traditional API and backend security failure path appears to have reached a system whose prompts, retrieval state, and user data were too tightly coupled.

In the AI era, some of the most damaging AI incidents will still begin as ordinary software bugs.
