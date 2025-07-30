---
title: 'Promptfoo Raises $18.4M Series A to Build the Definitive AI Security Stack'
description: 'We raised $18.4M from Insight Partners with participation from Andreessen Horowitz. Funding will accelerate development of the most widely adopted AI security testing solution.'
image: /img/blog/series-a-announcement.jpg
keywords:
  [
    Promptfoo funding,
    Series A announcement,
    AI security startup,
    LLM vulnerability testing,
    AI application security,
    Insight Partners investment,
    AI safety investment,
    Promptfoo news,
    enterprise AI security,
    AI red teaming,
  ]
date: 2025-07-29
authors: [ian, michael]
tags: [company-update]
---

# Promptfoo Raises $18.4M Series A to Build the Definitive AI Security Stack

**Led by Insight Partners with participation from Andreessen Horowitz.**

Promptfoo has raised an $18.4 million Series A led by Insight Partners, with participation from Andreessen Horowitz.

We started Promptfoo in 2024 after watching AI systems grow increasingly complex while security tooling lagged behind. Today, over 125,000 developers use our open source framework and more than 30 Fortune 500 companies run our platform in production.

## The real problem we're solving

AI security has become the largest blocker to enterprises shipping generative AI applications to end users. We see it every day—companies want to deploy AI applications, but they're held back by security concerns.

Architectures like agents, RAGs (Retrieval-Augmented Generation), and most recently MCP (Model Context Protocol) have expanded what's possible with AI, but they've also dramatically increased the attack surface:

- **Autonomous agents** execute actions with production system access
- **RAG pipelines** can leak entire knowledge bases through retrieval manipulation
- **MCP servers** enable tools and APIs that introduce new injection vectors
- **Multimodal systems** accept text, voice, and images—each a potential attack vector

As these architectures hit production, we're seeing real-world incidents of prompt injection, data leakage, insecure tool use, and more. Traditional security tools weren't built for this complexity, and manual testing can't keep pace.

<!-- truncate -->

## Who's using Promptfoo

The adoption has been incredible:

- **125,000+ developers** have downloaded our open source tools
- **30+ Fortune 500 companies** run Promptfoo in production CI/CD pipelines
- **Foundation model labs** test their models with Promptfoo before release

## Welcome to Ganesh Bell

We're excited to have Ganesh Bell, Managing Director at Insight Partners, join our board. He brings deep experience scaling developer platforms at GE Digital and Uptake.

"Promptfoo has created a category-defining product," said Ganesh. "Every serious enterprise deploying AI will need comprehensive security testing, and Promptfoo's combination of technical depth, open source adoption, and enterprise traction positions them perfectly to capture this massive market opportunity. We're thrilled to partner with them as they build the full AI security stack."

"When we first invested in Promptfoo, we recognized that AI security would become mission-critical for every enterprise," said Zane Lackey, General Partner at Andreessen Horowitz. "In just one year, they've validated that thesis and then some. This additional investment reflects our conviction that they'll define how companies approach AI security for years to come."

## What's next: Building for the agentic future

The internet is being rebuilt for agents, and the APIs they call are increasingly being exposed as Model Context Protocol (MCP) servers. We're seeing a shift from single-turn text to long-running, tool-using agents that can collaborate, hand off tasks, and critique each other. These agents may live in untrusted environments, execute code, and have access to sensitive data. Large enterprises are embedding vast amounts of proprietary data into RAGs and agents. These new architectures introduce unique risks.

Our roadmap focuses on four key trends:

First, we're adding deep support for agentic and multi-agent workflows, including chain-level tracing and safety checks that watch conversations unfold over many steps.

Second, we're embracing MCP as the wiring standard for tool calls, so every function invocation can be captured, replayed, and scored for correctness and security.

Third, voice and other audio-first interfaces are resurging thanks to better speech models, so we're building native audio features to secure spoken applications.

Finally, prompt work is moving toward test-driven development: teams write evaluations first, run them on every commit, and rerun them automatically whenever an application is updated.

Regulation is also accelerating. EU AI Act includes fines for insufficient testing and transparency. In the United States, OWASP LLM Top 10 and NIST AI Risk Management Framework are often cited as key requirements.

## Our long-term vision

Red teaming is becoming a staple requirement of the enterprise AI development cycle. As organizations mature in their AI development, they go from prototype to product quality evaluations to adversarial evaluations (red teaming).

While red teaming still looks specialized today, as AI agents become increasingly capable, continuous adversarial testing will become as fundamental as unit tests in traditional software.

Our long-term vision is for Promptfoo to play the same role in AI infrastructure that CI pipelines play in DevOps: every new model or prompt change, or tool integration is automatically evaluated, red-teamed, and either blocked or promoted with a signed safety report.

We're hiring aggressively across engineering, research, and go-to-market to make this vision a reality.

## Why we're developer-first

AI teams are evolving from "vibes-based" testing to rigorous quality evaluations to comprehensive red teaming. We're powering that entire journey.

By making security testing as natural as running unit tests, we help developers:

- Catch vulnerabilities during development, not after deployment
- Build security expertise into their teams
- Ship faster with confidence
- Meet compliance requirements without friction

## Get involved

The best time to secure your AI is now:

→ **[Try our open source tools](https://github.com/promptfoo/promptfoo)** - Free forever  
→ **[Request an enterprise demo](https://promptfoo.dev/contact)** - See how Fortune 500s secure their AI  
→ **[Join our team](https://promptfoo.dev/careers)** - We're hiring!

---

_For media inquiries: press@promptfoo.dev_
