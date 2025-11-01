---
title: 'Security risks: vibe hacking and the rise of AI-assisted attacks'
description: "Anthropic's threat intelligence report reveals how AI coding agents are being weaponized for cyberattacks, from vibe hacking to ransomware-as-a-service. Learn about the security risks and defense strategies."
image: /img/blog/anthropic-threat-intelligence/header_redpanda_reading_report_promptfoo.png
keywords:
  [
    AI security,
    vibe hacking,
    AI-assisted attacks,
    threat intelligence,
    cybersecurity,
    AI coding agents,
    ransomware,
    malware development,
    AI fraud,
    cyber threats,
  ]
date: 2025-09-19
authors: [tabs]
tags: [security-vulnerability, threat-intelligence, ai-security, cybersecurity]
---

# Security risks: vibe hacking and the rise of AI-assisted attacks
Along with the rise of nice things comes the rise of people who don't want everyone to have nice things. Vibe coding has - as everyone who's been in cybersecurity for long enough knows - inevitably led to the rise of vibe hacking and security risks abound. Previously, attackers would be limited to using their expertise to hack into systems and enact some damage. Perhaps we should've been more stringent with security measures as we lowered the bar for everyone.
Anthropic has kindly produced a [Threat Intelligence Report (August 2025)](https://www-cdn.anthropic.com/b2a76c6f6992465c09a6f2fce282f6c0cea8c200.pdf). There are six main case studies:
1. Vibe hacking: how cyber criminals are using artificial intelligence (AI) coding agents to scale data extortion operations
2. Remote worker fraud: how North Korean IT workers are scaling fraudulent employment with AI
3. No-code malware: selling AI-generated ransomware-as-a-service
4. Chinese threat actor leveraging Claude across nearly all MITRE ATT&CK tactics
5. Auto-disruption of a North Korean malware distribution campaign
6. No-code malware development campaign

Additionally, there are four case studies directly relating to AI-assisted fraud:
1. Threat actor leverages MCP for stealer log analysis and victim profiling
2. Carding store powered by AI
3. Romance scam bot powered by AI models
4. Synthetic identity services powered by AI

I group them below as I highlight key points.

## 1. Vibe hacking the way to extortion and MITRE ATT&CK tactics
[Claude Code was](https://www.anthropic.com/claude-code) used extensively to conduct an extortion operation that spanned 17 organizations (including defense, health, and government) with some ransom amounts of over USD 500,000. This occurred in five phases:
1. Reconnaissance and target discovery
2. Initial access and credential exploitation
3. Malware development and evasion
4. Data exfiltration and analysis
5. Extortion analysis and ransom note development
It also occurred on Kali Linux. I guess they're cybersecurity professionals too... Just the malicious kind.
AI was used to:
- Scan thousands of VPN endpoints for the most exploitable options
- Create scanning frameworks from APIs to build infrastructure profiles of technologies
- Scan networks to identify critical systems
- Extract credentials
- Provide live guidance during an attack (don't knock the power of AI mentorship, I guess)
- Build malware that not only evades Windows Defender but successfully masquerades as typical software
- Extract and analyze data then used to inform the extortion analysis
- Generate customized ransom notes

![Claude simulated post-hack analysis report screenshot](/img/blog/anthropic-threat-intelligence/anthropic_screenshot_ladyofcode.png)

*Excerpt from the Claude simulated post-hack analysis report. [Source](https://www-cdn.anthropic.com/b2a76c6f6992465c09a6f2fce282f6c0cea8c200.pdf)*

Similarly, a Chinese actor attacking Vietnamese critical infrastructure used Claude Code to execute 12 of the 14 MITRE ATT&CK tactics, with much of the above AI vibe coding activities involved. Vietnamese telecommunications, government agencies, and agricultural systems were affected. The tactical and strategic decisions suggest it was a part of an intelligence operation. Confidentiality - gone.

### AI in the hands of both experts and noobs causes damage
For the most part, AI is most useful in the hands of an expert. They know exactly how to direct it to enable them to scale productivity and by productivity I also mean cyberattacks. For everyone else, we've lowered the bar to experimentation with a mentor.
Automation of security tooling will become integral to defending against AI-assisted attacks. Attack surface management will likely need to become continuous and automated as well as security mechanisms elevated beyond the basics.

## 2. Remote worker fraud
North Korean IT workers were using AI... To be employed. They used four phases:
1. Persona development
2. Application and interviewing
3. Employment
4. Revenue generation
However, the revenue was used to fund North Korea's weapons programs. Merely a tad more innocuous than 'I just want a job to pay rent😭'.
AI was used to craft believable identities, construct technical backgrounds with portfolios and CVs to match, pass multiple interview stages, deliver technical work, communicate with the team, handle code reviews, and most importantly: maintain the illusion of competence.
I ended up engaging with some... Interesting takes around remote worker fraud. The result: if remote workers are delivering the work requested, the level of fraud is debatable (even if vibe-coded), but the security risk of another country masquerading operatives as employees to gain information is unacceptable.

### Vet strictly
Operatives are no longer necessarily trained specialists. They can be tech noobs powered by AI™.
Appropriate vetting is paramount. This includes a human-involved understanding of skill level and detecting for AI usage in the interviewing process. If a hiring process allowed incompetence through, it's broken - with or without someone vibe coding or using AI to get through it.

## 3. Ransomware-as-a-service and other malware
RaaS is being built by people with far less expertise than usually required. AI has been used to employ very specific techniques:
- Evasion using RecycledGate and FreshyCall techniques
- Encryption (ChaCha20)
- Anti-recovery mechanisms
- Professional packaging
That 'professional packaging' is the icing on the cake. AI doesn't just lay out the path to creating malware; it helps package it up all nice and shiny for a three-tiered marketing strategy tailored to the criminal scene.
The malware produced was surprisingly robust in its feature set. The list spanned a page and a half. There is mention of the actor being unable to implement encryption algorithms themselves or understand system calls. However, I don't manually write my own encryption algorithms either; even technical people 'outsource technical competence'. The key takeaway is that we're giving less technical people more of the middle implementation skill set. They simply need to conceptually understand the parts of the software and know enough about how software is built and rely on AI-assisted coding and AI tools. Existing code is plentiful and makes it easier.
A North Korean actor produced malware targeting job seekers as part of the wider DPRK 'Contagious Interview' campaign. Claude's expected usage was for anything from enhancing existing malware to creating social media phishing lures to facilitating fake interviews. Similarly, a Russian-speaking actor created malware targeting users through fake software downloads. Claude was used for system calls, creating a Telegram bot, disguising the malware as legitimate software (e.g. Zoom), and more.

### Malware detection and education are more important than ever
Anthropic appear to be doing what they can to bar would-be criminals from using Claude and associated code tools. Their detection and mitigation mechanisms are thankfully improving.
Everyone else should strengthen malware detection practices and improve software verification to reduce security risks.
Education is also necessary. [Developers are targets, too](www.kaspersky.com/about/press-releases/kaspersky-uncovers-500k-crypto-heist-through-malicious-packages-targeting-cursor-developers) - we've got our own habits and expectations to curtail. Choosing an IDE extension based on the number of downloads, for example, is a poor indicator of validity. My own big head was suitably deflated when I was faced with a fake Cloudflare page and in my very tired state (*excuses!*) I nearly plagued my own system.

## Combatting fraud
Fraud is becoming easier for anyone to undertake. The case studies involved:
1. A Russian-speaking actor used Model Context Protocol and Claude to create behavioral profiles of victims' computer usage patterns
2. A Spanish-speaking actor used Claude Code to essentially build a stolen credit card reselling service
3. Claude was used to support romance scams via a Telegram bot
4. A synthetic identity service using Claude to avoid detection
AI was used for all manner of tasks across the above:
- Processing files
- Building profiles on people and tools alike
- Avoiding detection from software
- Bolstering deception
- Enterprise-grade operational security measure implementation

### It'll take a while to catch up to vibe coding
It would take a combination of detecting fraud, educating users, and ensuring software systems implement up-to-date features to enable swift damage control. Reducing cards getting compromised in the first place would be the best place to start.

## Swing the pendulum faster
Defenses are known to generally lag behind attacks - sometimes by a few years. We should be increasing regular testing of our products and growing powerful red teams. General security education should not just be baked into documentation but a part of marketing content as well. Imagine if our grandparents no longer insisted on answering calls from that nice young man offering to help finally fix that broken printer and trolled them like this MVP:

![YouTube comment screenshot](/img/blog/anthropic-threat-intelligence/youtube_comment_ladyofcode.png)

*[Image source](https://www.youtube.com/watch?v=Zmty7AC5z5Y)*

Having a job in security is great but we can't let vibe coding reign supreme. Sharing information in the public's best interests like Anthropic is a great way to go, and sharing it soon is better. One of the above case studies mentioned attackers were stopped in October 2024.
Criminals (like the above) don't care about their coding approach. They're going to commit large-scale theft and have more important things to worry about. From the types of actors in these case studies, agonizing over writing code elegantly while they're planning an employment scam is not happening. Vibe coding - and by extension, vibe hacking - is here to stay. The potential impact for damage is growing rapidly. We can certainly catch up to them and secure our systems; we just have to be faster.

