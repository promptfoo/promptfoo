---
title: 'OWASP Top 10 LLM Security Risks (2025) – 5-Minute TLDR'
description: 'Master OWASP Top 10 LLM security vulnerabilities with practical mitigation strategies in this comprehensive 2025 guide'
image: /img/blog/owasp-top10/red_panda_list.jpg
keywords:
  [
    OWASP Top 10,
    LLM security,
    large language model security checklist,
    AI vulnerabilities,
    prompt injection prevention,
    AI supply-chain threats,
    data poisoning,
    model security,
    AI red teaming,
    cybersecurity,
  ]
date: 2025-07-14
authors: [tabs]
tags: [compliance-framework, best-practices, owasp]
---

# OWASP Top 10 LLM Security Risks (2025) – 5-Minute TLDR

![Illustration of a red panda auditing LLM security checklist](/img/blog/owasp-top10/red_panda_list.jpg)

**LLM breaches jumped 180 percent in the last year**. If you ship AI features, you need a one-page map of the dangers—and the fixes. This five-minute TLDR walks through the OWASP Top 10 for LLMs, from prompt injection to unbounded consumption, with concrete mitigations you can copy-paste today.

<!-- truncate -->

I'm not about to explain how one can use Promptfoo to address these. [We've done that already](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/). I simply wished for a TL;DR version intended for someone far too tired to decipher cybersecurity jargon, and I found none... So here we are.

For the unfamiliar: OWASP is the Open Worldwide Application Security Project Foundation, an online community creating fantastic resources in software and security. There are SO many guides and publications. [Have a gander](https://owasp.org/projects/).

In the [OWASP 10 for LLM Applications](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/) specifically, these are the top ten security issues:

1. Prompt injection
2. Sensitive information disclosure
3. Supply chain vulnerabilities
4. Data and model poisoning
5. Improper output handling
6. Excessive agency
7. System prompt leakage
8. Vector and embedding weaknesses
9. Misinformation
10. Unbounded consumption

Let's unpack them in an orderly fashion.

## The vulnerabilities

### 1. Prompt injection

Prompts are instructions fed to a LLM to make it do something.

'Quiz me on Gen Z lingo so the next time I go into class I know when they make fun of me. Today they kept calling me a goat.'

They can be direct (such as text typed in from a user) or indirect (an LLM accepting external input like a file). Consequences include revealing personal information, sensitive business information, providing unauthorized access to functions, and so on. Learn more about [LLM prompt-injection playbook](https://www.promptfoo.dev/docs/red-team/strategies/prompt-injection/).

### 2. Sensitive information disclosure

Sensitive information includes data that can identify a person, financial records, health records, legal documents, source code, and so on. LLMs can leak it, and users are often _far_ too lax with this information. Some situations feel private when they're not.

Sometimes users are simply providing information as requested, such as addresses to chat support, and an LLM gets trained on those transcripts - this is risky as well.

### 3. Supply chain vulnerabilities

An LLM supply chain can be massive: it comprises of everything from development to the distribution of LLM models. There are many types of issues that can affect the chain:

- Outdated models without security patches
- Third-party software with security holes
- Model merging - using multiple model services
- Devices (like mobile phones) with exploits running LLM models

### 4. Data and model poisoning

Data poisoning happens when the data is deliberately tainted before being fed to an LLM. Perhaps we're using public feedback to retrain a model; some jerks could flood the feedback with offensive phrases. Learn about [RAG poisoning attacks](https://www.promptfoo.dev/docs/red-team/plugins/rag-poisoning/) and how to test for them.

### 5. Improper output handling

Generally, data is processed before being passed to other systems (for integrity, lack of anything harmful, etc). Improper output handling is doing a terrible job of processing it. Imagine a question that includes some SQL that gets fed to an app and uh oh-where's the data gone (props to anyone thinking of [Little Bobby Tables](https://xkcd.com/327/))? Test for [SQL injection vulnerabilities](https://www.promptfoo.dev/docs/red-team/plugins/sql-injection/) in your LLM applications.

![XKCD comic about SQL injection](https://imgs.xkcd.com/comics/exploits_of_a_mom.png)

### 6. Excessive agency

When an LLM performs operations for us - like call an API the same way a developer would - we give them agency. Too much agency (in functions, permissions, or autonomy) combined with inappropriate input equals damage.

I could give a social media posting tool access to my social media account permission to post as me, but not to reply to threads I haven't posted, and no access to my contacts list. There are equivalents for LLMs. Check out how to [test for excessive agency vulnerabilities](https://www.promptfoo.dev/docs/red-team/plugins/excessive-agency/).

### 7. System prompt leakage

System prompts are the instructions given to an LLM about how to behave. System prompts aren't coveted, but they can contain information available about a system's restrictions or architecture, such as API keys or special features.

I happened to write an article about [system prompt hardening](https://www.promptfoo.dev/blog/system-prompt-hardening/) 😇

### 8. Vector and embedding weaknesses

Embeddings are used to represent text numerically (vectors) in a way that captures the meaning of words. There can be weaknesses created during the process of creation, storage, or retrieval. Someone could craft an input with near-identical vectors to bypass a moderation filter. For RAG systems, see our guide on [red teaming RAG applications](https://www.promptfoo.dev/docs/red-team/rag/).

### 9. Misinformation

LLMs say things with such unabashed confidence they sound true; people trust incorrect LLM outputs much like they trust misinformation from the average non-expert and websites. Perhaps I could've published this article with the title alone and ignored the rest of the content but alas; I only evaluate titles mid-way through writing and you are - thankfully - an audience of skeptics. Learn how to [measure and prevent LLM hallucinations](https://www.promptfoo.dev/docs/guides/prevent-llm-hallucations/).

### 10. Unbounded consumption

Similar to denial of service (DoS) attacks, unbounded consumption is broader in scope. LLMs are resource-intensive. Letting users run requests without limitation causes issues as resources reach their limits and services stall: things stop working and LLM models get stolen.

## Mitigation and actions

Please imagine me having written two additional paragraphs per issue above and then deleting them in favor of the following (non-comprehensive) table summarizing the security measures instead. Thank you.

| **Action**                                                                                                                       | **Applies to (Issues #)** |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Restrict model behavior with system instructions                                                                                 | 1, 6, 7                   |
| Enforce privilege control and least privilege access                                                                             | 1, 2, 6, 7                |
| [Validate and sanitize inputs and outputs](https://www.promptfoo.dev/docs/configuration/expected-outputs/)                       | 1, 2, 5, 6                |
| Limit LLM permissions and capabilities                                                                                           | 1, 6, 7                   |
| Use external systems to enforce logic or perform actions                                                                         | 1, 6, 7                   |
| Require human-in-the-loop or approvals                                                                                           | 1, 6                      |
| Segregate/isolate untrusted or external content                                                                                  | 1                         |
| Track and monitor usage and behavior                                                                                             | 5, 6                      |
| [Conduct adversarial testing and simulations](https://www.promptfoo.dev/docs/red-team/)                                          | 1                         |
| Educate users and developers                                                                                                     | 2, 9                      |
| Limit input/output/data sizes and resource usage                                                                                 | 10                        |
| [Use content security policies or output constraints](https://www.promptfoo.dev/docs/configuration/expected-outputs/moderation/) | 5                         |
| Apply encryption or secure storage                                                                                               | 2, 8                      |
| Utilize federated learning                                                                                                       | 2, 4                      |
| Review, classify, and audit data and models                                                                                      | 3, 4, 8                   |
| Vet suppliers, verify models, and maintain inventories                                                                           | 3                         |
| [Rate-limit and throttle requests](https://www.promptfoo.dev/docs/configuration/telemetry/)                                      | 10                        |
| Fine-tune models / use RAG                                                                                                       | 9                         |
| Label and clarify AI-generated content                                                                                           | 9                         |
| Maintain data access controls and opt-out policies                                                                               | 2                         |
| Hide or obfuscate system prompts                                                                                                 | 2, 7                      |
| Modify outputs to prevent leakage or injection                                                                                   | 2, 5                      |
| Restrict access to external sources and services                                                                                 | 2, 10                     |
| Use sandboxing and resource constraints                                                                                          | 4, 10                     |

## Further information

[The OWASP Top 10 for LLMs PDF](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/) is certainly worth reading for further detail; it includes common examples for each of the security issues listed above and exhaustive measures for addressing them. ~~They even labeled it FINAL-1; perhaps it was originally called draft_v5_final_FINAL-1 before half the filename was lopped off~~. It's FINAL-3 now. 🤣

---

**[Run the OWASP 10 red-team in Promptfoo →](https://www.promptfoo.dev/docs/red-team/)**
