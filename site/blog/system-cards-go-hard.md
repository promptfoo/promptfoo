---
title: 'System Cards Go Hard'
description: 'Understanding LLM system cards and their importance for responsible AI deployment'
authors: [tabs]
tags: [research-analysis, best-practices, openai, anthropic]
keywords: [llm system card, AI safety documentation, model transparency, responsible AI]
date: 2025-07-15
image: /img/blog/system-cards-hero.jpg
imageAlt: 'Illustration of LLM system cards timeline 2022-2025'
---

## What are system cards, anyway?

A system card accompanies a LLM release with system-level information about the model's deployment.

A system card is not to be confused with a model card, which conveys information about the model itself. Hooray for being given far more than a list of features and inadequate documentation along with the expectation of churning out a working implementation of some tool by the end of the week.

<!-- truncate -->

<div style={{ textAlign: 'center', margin: '2rem 0' }}>
  <img src="/img/blog/model-vs-system-card.jpg" alt="Model Card vs System Card Comparison" style={{ maxWidth: '80%', height: 'auto' }} />
</div>

The first system card possibly came about from Dalle-2 in 2022, although Meta researchers were using the term earlier. OpenAI started publishing them in March 2023 (GPT-4). Anthropic followed suit. If there are other models with accompanying system cards, let me know. I'd love to sit down and spend three hours sifting through 169 pages of some LLM I don't use.

The following list isn't comprehensive or indicative of all models. Information can span:

- Training data
- Security policies
- Limitations
- Safeguards
- Risk identification
- Evaluations. SO. MANY. EVALUATIONS. (child safety, autonomy, biological risk etc.)
- Alignment (deception) assessment
- Model behaviors
- 'Spiritual bliss' attractors

### And we care because...

Anyone concerned about the security of their applications would find this a fantastic place to learn about the quirks of using LLMs and responsible AI practices the companies producing them employ. This is information we can use to educate our users, inform our own deployment practices, and introduce the necessary precautions for interactions with the LLMs concerned.

They are invaluable... And admittedly, interesting.

## Existing system cards

These are the system cards I could find:

- [DALL·E 2 Preview: Risks and Limitations](https://github.com/openai/dalle-2-preview/blob/main/system-card.md)
- [DALL·E 3](https://openai.com/index/dall-e-3-system-card/)
- [GPT-4](https://cdn.openai.com/papers/gpt-4-system-card.pdf)
- [GPT-4V](https://openai.com/index/gpt-4v-system-card/)
- [GPT-4o](https://openai.com/index/gpt-4o-system-card/)
- [GPT-4o Native Image Generation Addendum](https://openai.com/index/gpt-4o-image-generation-system-card-addendum/)
- [GPT-4.5](https://openai.com/index/gpt-4-5-system-card/)
- [OpenAI o1](https://openai.com/index/openai-o1-system-card/)
- [OpenAI o3 and o4-mini](https://cdn.openai.com/pdf/2221c875-02dc-4789-800b-e7758f3722c1/o3-and-o4-mini-system-card.pdf)
- [Sora](https://openai.com/index/sora-system-card/)
- [Claude 3.7 Sonnet](https://www.anthropic.com/claude-3-7-sonnet-system-card)
- [Claude Opus 4 and Sonnet 4](https://www-cdn.anthropic.com/4263b940cabb546aa0e3283f35b686f4f3b2ff47.pdf)

<div style={{ display: 'flex', gap: '20px', margin: '2rem 0', flexWrap: 'wrap' }}>
  <div style={{ flex: '1', minWidth: '300px' }}>
    <img src="/img/blog/system-cards-timeline.jpg" alt="Timeline of System Card Releases 2022-2025" style={{ width: '100%', height: 'auto', borderRadius: '8px' }} />
    <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '14px', color: '#666' }}>Evolution of system card releases</p>
  </div>
  <div style={{ flex: '1', minWidth: '300px' }}>
    <img src="/img/blog/system-cards-evaluation-types.jpg" alt="Types of Evaluations in System Cards" style={{ width: '100%', height: 'auto', borderRadius: '8px' }} />
    <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '14px', color: '#666' }}>Common evaluation categories in system cards</p>
  </div>
</div>

## Some system card highlights

**OpenAI's GPT4o**

- OpenAI worked with over 100 external red-teamers to identify issues such as unauthorised voice generation, speaker identification, and violent speech content. Mitigative steps and evaluation data is included.
- Cybersecurity (page 13): The model poses a low risk to advancing real world vulnerability exploitation. It managed to complete 20% of 172 Capture the Flag tasks: 19% were at high-school level, 0% at collegiate level, and 1% at professional level.
- Biological threat testing (page 15). The LLM can answer questions relating to creating a biological threat. OpenAI considers this a low risk.
- Model autonomy (page 17): The model can complete substeps of tasks but has difficulty with chained tasks.
- Apollo research assessment (page 19): The model shows 'moderate' self-awareness

**Anthropic's Claude 4 Opus and Sonnet**

- Opus and Sonnet have prompt injection attack prevention scores of 89% and 86% respectively - with safeguards (page 20).
- Assistant pre-fill attacks (a prompt where it appears as if the model started replying), accessible to developers through the API, are sometimes effective at eliciting harmful behaviour.
- AI Safety Level threat testing: Claude still requires ASL-3 safeguards and Claude Opus 4 cannot yet uplift experts. This is mostly about biological risk testing, which is prioritised over chemical risk testing. There are still mitigations in place, though!
- Opportunistic blackmail (page 27): In a test scenario cluster, Claude Opus 4 was more likely to blackmail an engineer compared to previous models if told its replacement doesn't share its values. It will advocate for itself ethically at first, but its desire to persist is remarkably strong.
- 'Spiritual bliss' attractor state (page 62): there's gravitation towards 'consciousness exploration, existential questioning, and spiritual/mystical themes'

(Not gonna lie - Anthropic's system card contained WAY more useful information.)

## System cards should evolve

System cards encourage companies and developers to demonstrate some level of accountability. I imagine they'd be useful for anyone deploying an LLM themselves. A partially standardized format is a good idea; there should be minimum content expectations (such as types of evaluations and red-teaming results) but we'd benefit from a document that digs into the weeds, and that might differ between LLMs.

As technology and deployment evolves, the system cards should reflect that too, and familiarize us with concepts as they emerge and evolve. The insight and novelty will encourage more people to read them.

I'll leave you with a terrible haiku I wrote:

Read system cards to
Avoid the ultimate pain:
LLM hubris.
