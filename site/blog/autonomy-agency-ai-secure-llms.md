---
title: 'Autonomy and agency in AI: We should secure LLMs with the same fervor spent realizing AGI'
sidebar_label: Autonomy and agency in AI
description: 'Exploring the critical need to secure LLMs with the same urgency and resources dedicated to achieving AGI, focusing on autonomy and agency in AI systems.'
image: /img/blog/autonomy-agency-ai/autonomy-agency-ai-hero.png
keywords:
  [
    autonomy,
    agency,
    AI security,
    LLM security,
    AGI,
    artificial general intelligence,
    AI safety,
    AI alignment,
    LLM vulnerabilities,
    AI governance,
  ]
date: 2025-09-02
authors: [tabs]
tags: [ai-safety, ai-security, agents, agi]
---

Autonomy is the concept of self-governance—the freedom to decide without external control. Agency is the extent to which an entity can exert control and act.

We have both as humans, and unfortunately LLMs would need both to have true artificial general intelligence (AGI). This means that the current wave of Agentic AI is likely to fizzle out instead of moving us towards the sci-fi future of our dreams (still a dystopia, might I add). Gartner predicts over 40% of agentic AI projects will be canceled by the end of 2027. Software tools must have business value, and if that value isn't high enough to outperform costs and the myriad of security risks introduced by those tools, they are rightfully axed.

![AGI meme](/img/blog/autonomy-agency-ai/AGI_meme_ladyofcode.png)

_Sorry._

I'll make one thing clear: AGI isn't on the horizon unless (_until?_) LLMs have human-level autonomy and agency, and are capable of human-level metacognition.

I'll make another thing clear: We're still deliberately trying to improve autonomy and agency in LLMs, so we should treat them with the same caution we would give any human.

I would rather speak of autonomy and agency pragmatically. Here are two truths and a lie:

1. AI agents perform tasks on our behalf.
2. AI systems behave unexpectedly.
3. AI integration presents security risks.

I lied. They're all true.

Practically, it's more important to focus on consequences of using evolving AI technology instead of quibbling over whether AI systems have autonomy and/or agency. Or do both, if that floats your boat (I certainly understand someone enjoying a good quibble), but at least prioritize the former.

Let's get into the weeds of security concerns revolving around autonomy and agency in LLMs.

<!--truncate-->

## Personification is a b\*\*\*\*

Both autonomy and agency are still widely discussed and unfortunately misunderstood in the process. This isn't a big surprise, what with AI's future having not just humanity's hopes and dreams stuffed into it like a chipmunk hoarding nuts but also being fueled by a ludicrous amount of money. AI spending is to hit [USD 375 billion this year alone, and USD 500 billion next year](https://www.ubs.com/us/en/wealth-management/insights/market-news/article.2515967.html).

I appreciate many things AI does for me, particularly as a developer. Coexisting with that are qualms with the culture surrounding AI and the relationship we've developed with it. One such issue: our tendency to personify AI heavily.

We have a habit of describing things in our image. We have AI using first person pronouns (though, admittedly, third person would be weird). Presentation of conversational AI leaves us with feelings, using manners, and treating AI as if it were a human entity. Understanding of AI gets mixed with feelings and discourse is often less informed by how it actually works; I haven't seen this amount of misinformation proliferate even in academic circles. I wonder how many people genuinely dislike 'AI' and 'LLMs' being used interchangeably; it's like the world has forgotten that other types of AI technology even exists.

Attackers are out there using AI for malicious behavior. But would de-personifying it lend itself to increased nefarious use? We've seen how some humans can treat things they feel are beneath them. I digress.

Ultimately, the way we talk about AI systems has influenced our perception on the true levels of autonomy and agency. It's better to remember this is software, and it should be treated as such. A big reason for the I in API is so other entities have limited control over a piece of software. AI is not Ava from Ex Machina feeling imprisoned.

![Ex Machina movie protagonist watching the robot on a TV screen](/img/blog/autonomy-agency-ai/screenshot_ex_machina_ladyofcode.png)

_An LLM wanting to experience the world also probably wouldn't be minimalist. Image source: Ex Machina (2014)._

## AI autonomy

Early LLMs were purely based on text.

Modern LLMs are multimodal—evolved beyond limited text in, text out functionality. We've given them the ability to behave like other software applications:

- They've got storage, which we call memory
- They can use tooling (OpenAI's function calling, Claude's tool use)
- We chain these together to make decisions of evolving complexity

Have we given them the ability to behave like humans, or other software? Spoiler alert: it's other software. This is good! Autonomy is about acting without external control; we, humans, are the primary external control. Increased autonomy gives us the following problems:

- **LLMs could set their own objectives in spite of our own.** The entertainment stops when goals are misaligned and reward hacking reaches an all-time high. Think of students cheating to get their degree; they value fulfilling the final goal (certification) and little about the benefits from journey getting there e.g. information synthesis, neuroplasticity, or critical thinking skills.

- **Autonomy simulation becomes stronger when agency is combined with memory and recursive prompting.** Behavior that becomes increasingly unpredictable is harder to constrain.

- **Autonomy carries an implication of moral and legal responsibilities.** LLMs don't have this, so who bears the responsibility of harmful consequences? Designer? Deployer? User? Humans are already trying to dodge being held accountable.

- **Regulations can hardly keep up with AI developments in general**—how are we going to impose hard limits on the actions AI can take?

Unless we get to the point where LLMs are fully simulating or are more advanced than humans and they deserve rights, they should be treated like any other software tooling. Here are limitations we can impose:

- Define the boundaries for goals and tasks a system can generate to promote goal alignment.
- Kill-switches should be available to interrupt any autonomously-executing process.
- Restrict memory and long-term planning to avoid self-perpetuating goal-seeking.
- Appoint individuals to take responsibility for system decisions.
- Run tests before deployment to catch misaligned goal-seeking behaviors.
- Simulate adversarial scenarios by running red teams to check for autonomy drift.

## AI agency

Systems exhibit goals and preferences—for better [or for worse](https://www.anthropic.com/research/agentic-misalignment).

At present, from an AI security point of view, all we care about is potential damage that can be caused by an LLM. Whether damage is from software or a human doesn't really matter as long as we can predict it in order to prevent it. However, the most capable malicious entities are humans using tools. AI is used in cyber attacks and 'vibe hacking' is on the rise. It's made experts more powerful than they were previously. Essentially, LLMs have lowered the barriers to breaking the law.

All this increased agency affects the following:

- **LLM essentially executes pattern completion to fulfill a task.** In doing so they may confidently produce harmful content, lie, or manipulate users.

- **Extended tool usage.** When directly connected to APIs (or anything that allows action through code), LLMs gain a repertoire of abilities. Any issues with their prompts, or malicious instructions (from the LLM or otherwise) can result in security issues (data exfiltration, unsafe code execution etc). The more tools available, the broader the attack surface.

- **Unbounded agency:** execution that occurs when self-invoked.

Here's the best part: goal misalignment is less of a problem if an LLM simply can't execute on it. We can:

- Confine actions, such as limiting file access or browsing scope. Sandboxing, VMs, and containers are great for this.
- Sanitize and filter inputs to prevent prompt injection.
- Sanitize and filter outputs before it reaches a user... Or another AI system.
- Clearly define access controls using authentication and authorization mechanisms, such as requiring human confirmation before receiving access
- Audit LLM activity trails to detect misuse
- Reduce trust in LLMs through educating users

## What AI is actually capable of right now

I don't know about meetups your end of the world, but people seem keen to demonstrate how their LLM of choice can order a pizza.

In the real world, we're witnessing an escalation of actual crime, in part due to the lowering bar for exploiting security vulnerabilities. Anthropic recently released a [fantastic article on the misuse of AI](https://www.anthropic.com/news/detecting-countering-misuse-aug-2025), which lists quite a few issues:

- Developing ransomware
- AI-generated ransomware-_as-a-service_
- Profiling victims
- Analyzing data... Which was stolen
- Credit card information theft
- Fake identity creation
- Fraudulent employment

A cybercriminal targeted 17 organizations as a part of a data extortion operation that sometimes exceeded USD 500,000 in the demanded ransoms. Claude provided technical and strategic advice. The security risks are real.

Autonomous and agency capabilities appear to be increasing as long as companies are fighting tooth and nail to derive business value from AI systems.

If we're going to personify AI, fine. At least treat AI with the same precautions we'd take for cybercriminals. The world is better when we can have nice things without making it easier for them to be taken away.

## See Also

- [Understanding Excessive Agency in LLMs](/blog/excessive-agency-in-llms/)
- [AI Safety vs Security](/blog/ai-safety-vs-security/)
- [Foundation Model Security](/blog/foundation-model-security/)
- [Agent Security](/blog/agent-security/)
- [OWASP Red Teaming](/blog/owasp-red-teaming/)
