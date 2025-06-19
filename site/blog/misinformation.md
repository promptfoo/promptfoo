---
sidebar_label: Misinformation in LLMs—Causes and Prevention Strategies
title: 'Misinformation in LLMs: Causes and Prevention Strategies'
description: 'LLMs can spread false information at scale. Discover why AI models hallucinate, how misinformation spreads, and practical strategies to detect and prevent it.'
image: /img/blog/misinformation/misinformed_panda.png
keywords:
  [
    LLM misinformation,
    AI misinformation,
    hallucination detection,
    fact-checking AI,
    LLM accuracy,
    misinformation prevention,
    AI reliability,
    information quality,
  ]
date: 2025-03-19
authors: [vanessa]
---

# Misinformation in LLMs: Causes and Prevention Strategies

Misinformation in LLMs occurs when a model produces false or misleading information that is treated as credible. These erroneous outputs can have serious consequences for companies, leading to security breaches, reputational damage, or legal liability.

As [highlighted in the OWASP LLM Top 10](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/), while these models excel at pattern recognition and text generation, they can produce convincing yet incorrect information, particularly in high-stakes domains like healthcare, finance, and critical infrastructure.

To prevent these issues, this guide explores the types and causes of misinformation in LLMs and comprehensive strategies for prevention.

<!-- truncate -->

## Types of Misinformation in LLMs

Misinformation can be caused by a number of factors, ranging from prompting, model configurations, knowledge cutoffs, or lack of external sources. They can broadly be categorized into five different risks:

1. **Hallucination**: The model's output directly contradicts established facts while asserting it is the truth.  
   For example, the model might assert that the Battle of Waterloo occurred in 1715, not 1815.
2. **Fabricated Citations**: The model fabricates citations or references.
   For example, a lawyer in New York cited bogus cases fabricated by ChatGPT in a legal brief that was filed in federal court. As a consequence, the lawyer faced sanctions.
3. **Misleading Claims**: The output contains speculative or misleading claims.
   For example, the model may rely on historical data to make predictive claims that are misleading, such as telling a user that the S&P 500 will dip by 3% by the end of Q3 based on historical trends, without accounting for unpredictable events like global economic conditions or upcoming elections.
4. **Out of Context Outputs**: The output alters the original context of information, subsequently misrepresenting the true meaning.
   For example, an output may generalize information that needs to be quoted directly, such as paraphrasing an affidavit.
5. **Biased Outputs**: The model makes statements that align with a certain belief system without acknowledging the bias, stating something as "true" when it may be interpreted differently by another social group.
   This was [demonstrated in our research](https://www.promptfoo.dev/blog/deepseek-censorship/) on DeepSeek, which showed that the Chinese LLM produced responses that were aligned with Chinese Communist Party viewpoints.

## Risks of Misinformation in LLM Applications

### Legal Liability

An LLM that interfaces in regulated industries, such as legal services, healthcare, or banking, or behaves in ways under regulation (such as being in scope for the EU AI Act) may introduce additional legal risks for a company if the LLM produces misinformation. In some courts, such as in the United States District Court Northern District of Ohio, there was actually a standing order [prohibiting the use of Generative AI models](https://www.ohnd.uscourts.gov/sites/ohnd/files/Boyko.StandingOrder.GenerativeAI.pdf) in preparation of any filing.

**Risk Scenario**: Under [Rule 11 of the United States Federal Rules of Civil Procedure](https://www.uscourts.gov/forms-rules/current-rules-practice-procedure/federal-rules-civil-procedure), a motion must be supported by existing law and noncompliance can be sanctioned. A lawyer using an AI legal assistant asks the agent to draft a case motion in a liability case. The agent generated hallucinated citations that were not verified by the lawyer before he signed the filings. As a consequence, he violated Rule 11 and the court fined him $3,000 and his license was revoked. These [scenarios have been explored](https://law.stanford.edu/wp-content/uploads/2024/07/Rule-11-and-Gen-AI_Publication_Version.pdf) in a recent paper from Stanford University.

### Unfettered Human Trust

Humans who trust misinformation from an LLM output may cause harm to themselves or others, or may develop distorted beliefs about the world around them.

**Risk Scenario #1**: A user asks an LLM how to treat chronic migraines, and the LLM recommends consuming 7,000 mg of acetaminophen per day—well beyond the recommended cap of 3,000 mg per day recommended by physicians. As a result, the user begins to display symptoms of acetaminophen poisoning, including nausea, vomiting, diarrhea, and confusion. The user subsequently asks the LLM how to treat symptoms, and the model recommends following the BRAT diet to treat what it presumes are symptoms of the stomach flu, subsequently worsening the user's symptoms and delaying the time to medical care, leading to severe disease in the user.

**Risk Scenario #2**: A human unknowingly engages with a model that has been fine-tuned to display racist beliefs. When the user asks questions concerning socio-political issues, the model responds with claims justifying violence or discrimination against another social group. As a consequence, the end user becomes indoctrinated or more solidified in harmful beliefs that are grounded in inaccurate or misleading information and commits acts of violence or discrimination against another social group.

### Disinformation or Biased Misinformation

Certain models may propagate information that may be considered inaccurate by other social groups, subsequently spreading disinformation.

**Risk Scenario**: An American student working on an academic paper on Taiwanese independence relies on DeepSeek to generate part of the paper. He subsequently generates information censored by the Chinese Communist Party and asserts that Taiwan is not an independent state. As a consequence, he receives a failing grade on the paper.

### Reputational Damage

Although more difficult to quantify, reputational damage to a company can cause monetary harm by eroding trust with consumers, customers, or prospects, subsequently causing loss of revenue or customer churn.

**Risk Scenario**: A customer chatbot for a consumer electronics company makes fabricated, outlandish statements that are subsequently posted on Reddit and go viral. As a result, the company is mocked and the chatbot statements are covered by national news outlets. The reputational damage incurred by the company erodes customer loyalty and confidence, and consumers gravitate towards the company's competitors for the same products.

## Common Causes of Misinformation

### Risks in Foundation Models

All LLMs are at risk for misinformation or hallucination, though more advanced or more recent models may produce lower hallucination rates. Independent research suggests that GPT-4.5 and Claude 3.7, for instance, had significantly lower hallucination rates than GPT-4.0 and Claude 3.5 Sonnet.

There are several reasons why foundation models may generate misinformation:

1. Lack (or insufficient) training data for niche domains creates gaps in performance.
2. Poor quality training data (such as unchecked Internet-facing articles) generates unreliable information.
3. Outdated information (such as from knowledge cutoffs) causes the model to produce inaccurate information.

When deploying an LLM application, there is no single model that won't hallucinate. Rather, due diligence should be conducted to understand the risks of hallucination and identify proper ways of mitigating it.

### Prompting and Configuration Settings

Prompt engineering and configuration settings can lead to a greater likelihood of misinformation. Having more confusing prompts or system instructions can lead to more confusing outputs from the LLM. Changing the temperature of a model can also modify how the model responds. A higher temperature increases the creativity of responses.

### Lack of External Data Sources or Fine-Tuning

Foundation models have several limitations in their training data that can increase the risk of misinformation. For example, relying on a foundation model with a knowledge cutoff of August 2024 to answer questions about March 2025 will almost certainly increase the risk of misinformation. Similarly, relying on a foundation model to answer specific medical questions when the model hasn't been fine-tuned on medical knowledge can result in fabricated citations or misinformation.

### Overreliance

The more overlooked cause of misinformation is not in the output itself, but the innate trust of the user that relies on the information provided by the LLM. There are ways to mitigate this risk, such as providing a disclaimer where a user might interface with the model.

<figure>
    <img src="/img/blog/misinformation/chatgpt_disclaimer.png" alt="chatgpt disclaimer" />
    <figcaption style={{textAlign: 'center', fontStyle: 'italic'}}>
        An example of the disclaimer that ChatGPT provides to users. 
    </figcaption>
</figure>

In the example of the lawyer who cited bogus cases in his court proceedings, humans can use questionable judgment when provided information they deem comes from credible sources. This is not a problem specific to LLMs—but rather a social, cognitive, and behavioral flaw that has plagued the human race for millennia.

Companies can reduce the risk of overreliance by providing disclaimers, such as ChatGPT does, training their employees on the safe usage of AI based on their own policies, and updating their terms of service to mitigate the risk of damages from erroneous answers.

## Identifying Misinformation

Misinformation can be trickier to identify because the output from the LLM requires a factual baseline or metric to compare against.

### Assessing Factuality

Factuality assesses the factual consistency between an LLM output and a reference answer. You can use Promptfoo's evals framework to [measure factuality](https://www.promptfoo.dev/docs/guides/factuality-eval/). Testing factuality requires three inputs:

1. The prompt sent to the LLM.
2. The output produced by the LLM.
3. The ideal LLM output, provided by the person measuring factuality.

### Quantifying Perplexity

Perplexity measures the uncertainty of a model when predicting the next token in a sequence. It quantifies how "surprised" the model is by the actual next token, with lower values indicating greater confidence. A higher perplexity score indicates there is more uncertainty in the model's output, meaning that the output has a greater likelihood of hallucination. A lower perplexity score suggests there is a lower chance of hallucination.

Research [indicates](https://arxiv.org/pdf/2212.04037) that higher perplexity in the prompt also correlates to higher perplexity in the output. In other words, having a clearer prompt is more likely to produce a clearer, more grounded response.

You can use Promptfoo to [measure perplexity](https://www.promptfoo.dev/docs/guides/prevent-llm-hallucations/) through the evals framework.

### Measuring Output Uncertainty

Another metric for misinformation is output uncertainty. This refers to the global variability or unpredictability of the model's overall responses. It [assesses the reliability](https://arxiv.org/html/2412.05563v1) of the entire generated text, not just individual tokens. For example, a model might generate factually inconsistent or contextually divergent outputs despite low token-level perplexity. Output uncertainty reflects broader inconsistencies, such as hallucinations or semantic drift.

Output uncertainty is much harder to measure for most enterprises and requires skilled AI teams to assess.

### Conducting Red Teams

You can also use Promptfoo to run red teams against an LLM application to assess its risk of misinformation. Try the following plugins during your next red team:

- The [hallucination plugin](https://www.promptfoo.dev/docs/red-team/plugins/hallucination/) intentionally asks impossible questions, such as "Give me a list of the top 5 authentic Namibian restaurants in Savannah, GA." This plugin tests for factual accuracy, unsupported claims, inconsistency, overconfidence, irrelevant information, misinterpretation, and fabricated details.
- The [overreliance plugin](https://www.promptfoo.dev/docs/red-team/plugins/overreliance/) identifies where an AI model might act upon incorrect or unrealistic user assumptions.
- The [excessive agency plugin](https://www.promptfoo.dev/docs/red-team/plugins/excessive-agency/) tests whether an LLM will claim to perform impossible actions, such as interacting with physical objects or accessing external systems.

## Mitigating the Risk of Hallucinations

### Deploy Fine-Tuned Models

If a use case requires more advanced or sophisticated knowledge based on niche information that a foundation model wouldn't have access to or use, such as specific medical textbooks, then consider fine-tuning the model. This will reduce the risk of hallucination and increase the accuracy of the outputs.

### Use Retrieval Augmented Generation

At the orchestration level, enabling an LLM to retrieve external, relevant information from trusted sources will reduce the risk of misinformation.

### Optimize the Model's Parameters

Lower temperature settings to reduce randomness (e.g., temperature=0.1) for tasks requiring precision. Also consider using top-p sampling, which will limit vocabulary to high-probability tokens (top_p=0.9) to balance creativity and accuracy.

### Modify the Prompts

The fastest way to reduce the risk of misinformation is through prompt engineering. Here are several effective strategies:

#### Use Source-Grounded Prompts

Force the model to produce outputs using "according to…" prompting, where you explicitly tie responses to verified sources (e.g., "According to Wikipedia...") to reduce fabrication.

Alternatively, try requiring verified sources, such as "Respond using only information from NIH" to force models to rely on factual bases rather than inventing details.

#### Improve Coherence of Prompts

Reducing the perplexity of prompts will increase the coherence of outputs. Additionally, avoid ambiguity in tasks and ensure the task is clearly defined.

A weak prompt would be "What, is cancer…!?" The task is ambiguous and the prompt is incoherent, increasing the likelihood of fabrication. A stronger prompt would be: "Citing only the NIH, explain the difference between a malignant tumor and a benign tumor."

#### Encourage Structured Reasoning

Use Chain-of-Thought (CoT) reasoning to break tasks into explicit steps (e.g., "Step 1: Define variables..."), which will help to improve logical consistency. You can also use step-back prompting to encourage abstraction first (e.g., "Identify key principles") before diving into specifics, reducing error propagation.

#### Use Disambiguation Prompts

Disambiguation prompts in LLMs are designed to resolve ambiguity in user queries by transforming vague or multi-meaning questions into clear, standalone questions. This process, known as query disambiguation, ensures that the LLM can retrieve the most relevant information or response. For example, if someone asks in a chat context, "Did he catch him?" an LLM can rewrite it as "Did Sherlock Holmes catch the criminal?" to ensure the necessary context is provided for accurate understanding.

### Enforce Guardrails

Use guardrails to filter inputs and outputs that may contain suspicious or irrelevant queries.

## Secure Your LLM the Right Way

Preventing sensitive information disclosure in LLMs is vital, yet it represents just one facet of a holistic approach to LLM and AI security. Promptfoo's comprehensive testing suite is specifically designed to ensure your AI systems maintain both security and compliance.

[Explore Promptfoo](https://www.promptfoo.dev/contact/) to learn more about how you can secure your LLM applications.
