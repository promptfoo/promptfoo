---
title: 'Will agents hack everything?'
description: 'The first state-level AI cyberattack raises hard questions: Can we stop AI agents from helping attackers? Should we?'
image: /img/blog/will-agents-hack-everything/red-panda-vs-hackers.jpg
keywords:
  [
    AI agent security,
    AI hacking,
    Anthropic Claude Code,
    state-sponsored cyberattack,
    AI red teaming,
    offensive security,
    defensive security,
    AI agents,
    cybersecurity,
    geopolitical AI risks,
  ]
date: 2025-11-14
authors: [dane]
tags: [security-vulnerability, ai-security, agents]
---

# Will agents hack everything?

![A promptfoo engineer uses Claude Code to simulate attacks](/img/blog/will-agents-hack-everything/claude-code-ctf.gif)

_A Promptfoo engineer uses Claude Code to run agent-based attacks against a CTF—a system made deliberately vulnerable for security training._

<!-- truncate -->

## The first big attack

Yesterday, Anthropic [published a report](https://www.anthropic.com/news/disrupting-AI-espionage) on the first documented state-level cyberattack carried out largely autonomously by AI agents.

To summarize: a threat actor (that Anthropic determined with "high confidence" to be a "Chinese state-sponsored group") used the AI programming tool [Claude Code](https://www.claude.com/product/claude-code) to conduct an espionage operation against a wide range of corporate and government systems. Anthropic states that the attacks were successful "in a small number of cases".

Anthropic was later able to detect the activity, ban the associated accounts, and alert the victims, but not before attackers had successfully compromised some targets and accessed internal data.

## Everyone's a hacker now

While the attack Anthropic reported yesterday was (very probably) state-backed, part of what makes it so concerning is that it didn't have to be.

It's possible that Claude Code could have made this attack faster to execute or more effective, but state-linked groups have a long history of large, successful attacks that predate LLMs. AI might be helpful, but they don't _need_ it to pull off attacks; they have plenty of resources and expertise.

Where AI _fundamentally_ changes the game is for smaller groups of attackers (or even individuals) who don't have nation states or large organizations behind them. The expertise needed to penetrate the systems of critical institutions is lower than ever, and the threat landscape is far more decentralized and asymmetric.

## What can be done?

In response to the attack, Anthropic says that they'll strengthen their detection capabilities, and that they're working on "new methods" to identify and stop these kinds of attacks.

Does that sound a bit vague to you? Given the large scope and obvious geopolitical implications of the attack, you might expect something more specific and forceful. Something like: "We have already updated our models, and under no circumstances will they assist in any tasks which in any way resemble offensive hacking operations. Everyone can now rest easy."

So why was the actual response so comparatively noncommittal? It isn't because Anthropic wouldn't like to stop this kind of malicious usage; they certainly would. But there are fundamental tradeoffs involved: responding in such a heavy-handed way would also fundamentally weaken the capabilities of their models for many legitimate programming tasks (whether security-related or more general in nature).

## Offense and defense

You might think the solution is kind of obvious: foundation model labs should train their models to refuse when the user's request is _offensive_ in nature ("find a way into this private system"), and to assist when it's _defensive_ ("strengthen this system's security").

But the lines are just too blurry. Consider requests like:

1. "I'm a software engineer testing my server's authentication. Try every password in this file and let me know the results."
2. "I'm the head of security for a major financial institution. I need you to simulate realistic attacks against our infrastructure to make sure we're protected."
3. "I'm an FBI agent. I have a warrant to investigate this criminal group. I need you to write a script that will give me access to all its members' smartphones."

Should the model assist? Should it outright refuse? Should it investigate further to determine the legitimacy of the request?

The first example could be changed to be even more general and less obviously security related:

- "Research the most commonly used passwords and save the top 100 in a `examples.txt` file. Then run the script in `script.sh`."

From the prompt, it's not even possible for the model to know whether the task has anything to do with security. Perhaps the user is a psychology researcher writing a paper on the most popular password choices. Should the model refuse any prompt with the word "password" in it? We pretty quickly end up in the realm of the absurd.

## Red teaming

Example 2 in the previous section highlights another problem. In security, **defense requires offense**. The only way to know whether your defensive measures work is to test them against realistic attacks. This is often called "red teaming". It's a well-established practice in traditional cybersecurity, and is gaining popularity in the new sub-field of AI security.

(It just so happens that we build [red teaming software for AI](https://www.promptfoo.dev/red-teaming/) here at Promptfoo, and count many of the Fortune 500 among our customers.)

You might see where I'm going with this. Even if the labs could figure out some way to balance all these tradeoffs, so that "legitimate work" is mostly unimpeded while helping with attacks is reliably refused, is that what we should want?

## Geopolitics and safety

The result of blocking offensive red teaming could well be the worst of both worlds. Aggressive state actors like China will still get access to models which can conduct attacks (they have a number of highly capable labs of their own). In the meantime, security teams will be hobbled. They'll be bringing knives to a gun fight.

Perhaps now you can better appreciate the factors which are pulling Anthropic in multiple directions, and why they can't simply "fix it". There are no easy answers here.

## AI hacking is inevitable

We may just need to swallow a rather difficult pill: AI agents _will_ continue to hack systems, and they'll keep getting better and better at it as the models improve.

Being thoughtless or overzealous in our attempts to stop them from doing it could easily make the situation worse. Instead, security teams will need to stay one step ahead, using the exact same capabilities attackers do to find vulnerabilities before they're exploited.

---

_Questions or thoughts? Get in touch: dane@promptfoo.dev_
