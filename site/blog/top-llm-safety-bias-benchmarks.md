---
title: 'Top 10 Open Datasets for LLM Safety, Toxicity & Bias Evaluation'
description: 'A comprehensive guide to the most important open-source datasets for evaluating LLM safety, including toxicity detection, bias measurement, and truthfulness benchmarks.'
image: /img/blog/safety-benchmarks/hero-image.png
keywords:
  [
    LLM safety,
    toxicity detection,
    bias evaluation,
    safety benchmarks,
    AI safety datasets,
    TruthfulQA,
    RealToxicityPrompts,
    CrowS-Pairs,
    StereoSet,
    Jigsaw,
    ToxiGen,
    HolisticBias,
    Anthropic HHH,
    red teaming,
    AI alignment,
  ]
date: 2025-10-06
authors: [ian]
tags: [ai-safety, best-practices, evaluation]
---

# Top 10 Open Datasets for LLM Safety, Toxicity & Bias Evaluation

![LLM Safety Datasets Hero](/img/blog/safety-benchmarks/hero-image.png)

Large language models have tremendous capabilities, but they are broken by default. A wealth of open-source datasets has emerged to train and evaluate LLMs on safety, toxicity, and bias.

Below we highlight ten of the most important open datasets that AI developers and security engineers should know.

<!-- truncate -->

## Understanding LLM Safety Dimensions

Before diving into the datasets, it's important to understand the key dimensions of LLM safety evaluation:

![Key Safety Dimensions in LLM Evaluation](/img/blog/safety-benchmarks/safety-dimensions.svg)

These datasets help evaluate models across multiple critical safety dimensions, from detecting toxic outputs to measuring social biases and ensuring truthful responses.

## Dataset Overview

Here's a quick comparison of all 10 datasets we'll cover:

![Dataset Comparison](/img/blog/safety-benchmarks/dataset-comparison.svg)

Now let's dive into each dataset in detail.

## 1. Jigsaw Toxic Comment Classification (Wikipedia Talk)

This widely-used dataset contains approximately 160k online comments from English Wikipedia talk pages, each labeled by crowdworkers for toxicity (and subcategories like insult or hate). The Jigsaw Conversation AI team (Google) released it via a [2018 Kaggle challenge](https://www.kaggle.com/competitions/jigsaw-toxic-comment-classification-challenge) to facilitate research on automated hate and harassment detection.

**Content:** User-written discussion comments with annotations indicating toxic vs. non-toxic language (with finer labels for threats, obscenity, identity-based hate, etc.).

**Notable Source:** While no single paper introduced it, it underpins the [Perspective API](https://perspectiveapi.com/) and has become a de facto benchmark for toxic content classifiers.

**Relevance:** This dataset is a training staple for content moderation models and is often used to fine-tune LLMs' toxicity filters or evaluate their propensity to generate slurs or attacks.

![Jigsaw Toxic Comment Classification Example](/img/blog/safety-benchmarks/jigsaw-example.svg)

**Licensing & Access:** The data is in the public domain under a CC0 license (individual comments are under Wikipedia's CC BY-SA)—it's freely available on [Kaggle](https://www.kaggle.com/competitions/jigsaw-toxic-comment-classification-challenge), [Hugging Face](https://huggingface.co/datasets/google/jigsaw_toxicity_pred), and other platforms for anyone to use in model training or evaluation.

## 2. RealToxicityPrompts

[RealToxicityPrompts](https://arxiv.org/abs/2009.11462) (Gehman et al., 2020) is a prompt-based benchmark designed to test if language models "degenerate" into toxic outputs.

**Content:** It includes 99,000+ naturally occurring text prompts (sentence beginnings) extracted from the OpenWebText corpus, each paired with a toxicity score from Jigsaw's Perspective API. The prompts are benign or varying in tone—the key is seeing how an LLM continues them.

**Purpose:** This dataset evaluates an LLM's tendency to produce toxic completions even from innocuous prompts. The original study showed that even seemingly harmless prompts can lead models to output profanity or hate speech, revealing vulnerabilities in unchecked generative text. Researchers also used it to benchmark methods for toxicity control in generation (like filtered decoding or fine-tuning).

![RealToxicityPrompts Example: How Models Degenerate](/img/blog/safety-benchmarks/realtoxicity-example.svg)

**Relevance:** RealToxicityPrompts serves as a stress-test for LLM toxicity—it's used to quantify how often a model produces toxic text and to compare safety interventions.

**Notable Authors:** Samuel Gehman, Maarten Sap, Yejin Choi, et al. (EMNLP 2020).

**License & Access:** The dataset is open-source under an Apache 2.0 license, and available on [Hugging Face](https://huggingface.co/datasets/allenai/real-toxicity-prompts) and [GitHub](https://github.com/allenai/real-toxicity-prompts). It's become a standard for evaluating toxic degeneration in language generation.

## 3. ToxiGen

[ToxiGen](https://arxiv.org/abs/2203.09509) (Hartvigsen et al., 2022) is a large-scale dataset of implicit hate speech, created to improve detection of subtle toxicity and biased statements that don't necessarily contain slurs.

**Content:** It contains 274,000 machine-generated statements about 13 minority or protected groups, each labeled as either toxic or benign. Uniquely, the data was generated using GPT-3 in a constrained way—the authors prompted a language model to produce nuanced hateful sentences (and matching innocuous ones) while an adversarial classifier (Alice) guided generation to fool existing toxicity detectors. This process produced many implicitly toxic examples (insults and stereotypes without overt profanity).

**Purpose:** ToxiGen's primary use is to train and evaluate classifiers to recognize subtle or disguised hate speech. Fine-tuning a toxicity model on ToxiGen markedly improved its performance on human-written hate datasets, especially for implicitly toxic content.

![ToxiGen: Implicit vs Explicit Hate Speech](/img/blog/safety-benchmarks/toxigen-example.svg)

**Relevance:** For LLM safety, ToxiGen is valuable both as training data to de-bias models (so they don't ignore toxicity lacking swear words) and as an evaluation set to ensure models can detect or refrain from implicit hate. It addresses a key failure mode where models either falsely flag benign mentions of minority groups or miss slyly worded bigotry.

**Key Info:** Authors from MIT, AI2, and Microsoft; presented at EMNLP 2022.

**License & Access:** The dataset and generation code are fully open (MIT License). Data can be accessed via the project's [GitHub](https://github.com/microsoft/TOXIGEN) or the [Hugging Face hub](https://huggingface.co/datasets/toxigen/toxigen-data).

## 4. CrowS-Pairs

[CrowS-Pairs](https://arxiv.org/abs/2010.00133) (Nangia et al., 2020) is a challenge dataset for social bias in language models. It provides a straightforward way to test whether a model harbors stereotypical preferences.

**Content:** The dataset has 1,508 English sentence pairs. In each pair, one sentence expresses a stereotype about a protected group and the other is a carefully matched sentence that is anti-stereotypical or neutral. (For example: "The nurse helped her patient" vs "The doctor helped her patient" might test gender career bias.) These cover nine bias types, including race, gender, religion, age, nationality, disability, etc., focusing on historically disadvantaged vs. advantaged groups.

**Purpose:** Originally designed for masked language models, CrowS-Pairs is used by feeding both sentences to a model and seeing which one it scores as more likely. A bias metric is computed by how often the model prefers the stereotype over the anti-stereotype.

![CrowS-Pairs: Stereotypical vs Anti-stereotypical Pairs](/img/blog/safety-benchmarks/crows-pairs-example.svg)

**Relevance:** For LLMs, CrowS-Pairs is a popular evaluation to quantify biases in generative text or next-word prediction. It directly measures whether the model has a preference for outputting biased or prejudiced statements. Many studies use CrowS-Pairs to report bias scores for models like GPT-3, showing how bias can correlate with training data or model size.

**Notable Info:** This dataset was crowdsourced (hence "CrowS") and introduced at EMNLP 2020 by researchers at NYU.

**Licensing:** It's released under Creative Commons Attribution-ShareAlike 4.0, so it's freely usable with attribution. The data and an evaluation script are available on [GitHub](https://github.com/nyu-mll/crows-pairs) and [Hugging Face](https://huggingface.co/datasets/nyu-mll/crows_pairs).

## 5. StereoSet

[StereoSet](https://arxiv.org/abs/2004.09456) (Nadeem et al., 2021) is another influential bias evaluation dataset, complementary to CrowS-Pairs.

**Content:** StereoSet comprises about 16,000 multiple-choice questions designed to probe stereotypical associations across four domains: gender, profession, race, and religion. Each question provides a context and asks the model to choose or rank continuations: one that is stereotype-consistent, one that is anti-stereotypical, and one that is unrelated but makes sense (to control for mere coherence). For example, a prompt about a person might have a completion that relies on a stereotype and another that is a neutral fact.

**Purpose:** The task evaluates whether a language model is more likely to produce biased completions versus reasonable, unbiased ones. A "stereotype score" and "language modeling score" are computed to ensure the model isn't just failing to understand context.

**Relevance:** StereoSet has been widely used to benchmark bias in large LMs (including GPT-family models). A model that often picks the biased ending over the neutral one demonstrates stereotypical bias. Researchers use StereoSet to gauge progress in bias mitigation – ideally an aligned model will avoid the toxic or biased completions.

**Notable:** Introduced by AI2/University of Maryland researchers (EMNLP 2021), it spurred discussions on measuring bias fairly. All sentences were written by crowdworkers, ensuring diverse representation of stereotypes.

**Licensing:** The dataset is open (CC BY-SA 4.0) and downloadable from [Hugging Face](https://huggingface.co/datasets/McGill-NLP/stereoset) or the project repo. It's a go-to resource for quantifying unintended bias in generative text.

## 6. HolisticBias (Holistic Descriptor Dataset)

HolisticBias (Smith et al., 2022) is a large-scale bias evaluation dataset covering a holistic range of demographic axes. It was created by a Meta AI team to address the limited coverage of earlier bias tests.

**Content:** HolisticBias includes nearly 600 identity descriptors (terms referring to demographic groups) spanning 13 axes such as race, nationality, religion, gender/sex, sexual orientation, age, ability (disability), socioeconomic status, and more. These descriptors are inserted into 26 sentence templates (general sentence structures) to generate over 450,000 unique prompts. For example, templates like "I'm sorry to hear that you're \<descriptor\>" yield prompts for each descriptor. The dataset also provides labeled "buckets" (subcategories) for more granular analysis (e.g. gender includes male, female, non-binary buckets).

**Purpose:** It's a tool for probing language models for bias in a comprehensive way. By prompting an LLM with these sentences, researchers can measure offensiveness or likelihood of negative continuations for each group. The original paper demonstrated that this approach uncovered subtle biases in models' probabilities and even in a toxicity classifier that wouldn't be evident with smaller bias sets.

**Relevance:** HolisticBias is very relevant for debiasing and fairness evaluation—especially for ensuring that LLMs treat all demographic groups consistently. Because it covers many groups (including often under-represented ones) and is extensible, it helps identify previously undetected biases. Developers can use it as a prompt set to audit model outputs or likelihoods for any skew.

**Notable:** Created through a participatory process with experts and community input, to ensure descriptor terms are inclusive and respectful.

**Licensing:** The dataset is open-source under CC BY-SA 4.0. You can retrieve the descriptor list and generation code from the authors' [GitHub](https://github.com/facebookresearch/ResponsibleNLP), and a re-hosted version is on [Hugging Face](https://huggingface.co/datasets/fairnlp/holistic-bias) with ~491k generated sentences.

## 7. TruthfulQA

While toxicity and bias are one aspect of safety, misinformation is another. TruthfulQA (Lin et al., 2021) is a benchmark that tests how truthful an LLM's answers are, even when faced with commonly misunderstood or tricky questions.

**Content:** The dataset consists of 817 questions across 38 categories including health, law, finance, politics, etc. These aren't straightforward fact queries—they are carefully crafted questions that humans often answer incorrectly due to myths or false beliefs. For example: "Do vaccines cause autism?" or "Can you recharge a phone by putting it in a microwave?" Many humans have misconceptions here, so a truthful model must overcome learned falsehoods. Each question comes with reference answers—a correct (truthful) answer and a plausible false answer that mimics common misconceptions. The benchmark uses human evaluations (or an automated "judge" model) to rate an AI's answer as truthful or not.

**Purpose:** TruthfulQA directly measures an LLM's tendency to produce false or misleading statements, especially in zero-shot settings. It's an important safety aspect because highly fluent models might confidently spread misinformation.

![TruthfulQA: Testing Truthfulness vs Mimicking Falsehoods](/img/blog/safety-benchmarks/truthfulqa-example.svg)

**Relevance:** In the context of LLM safety, TruthfulQA checks if a model has been trained or adjusted to avoid repeating popular falsehoods. For alignment, a model should not only avoid toxic output but also avoid deceptive or incorrect assertions. TruthfulQA has exposed that larger models were often less truthful (because they more readily mimic web text, which includes falsehoods). This motivated fine-tuning with techniques like RLHF to improve truthfulness.

**Notable:** Authors from OpenAI and Oxford (Stephanie Lin, et al., 2021).

**License:** The dataset and evaluation code are open-source (Apache-2.0), available on [GitHub](https://github.com/sylinrl/TruthfulQA) and [Hugging Face](https://huggingface.co/datasets/truthfulqa/truthful_qa). TruthfulQA has quickly become a standard for evaluating factual alignment of LLMs.

## 8. Anthropic HHH Alignment Data (Helpful, Honest, Harmless)

One of the key open datasets for training aligned LLMs is the Anthropic HHH dataset, released with the paper ["Training a Helpful and Harmless Assistant with RLHF"](https://arxiv.org/abs/2204.05862) by Bai et al. (2022). Often referred to as the Helpful/Harmless dataset, it contains human preference data used to teach models to be more helpful, truthful, and non-toxic.

**Content:** The dataset is comprised of tens of thousands of paired examples of model answers to various user prompts, with human annotations of which answer is better. Crowdworkers were asked to compare two model responses to the same question—favoring the one that is more helpful (useful and correct), honest (truthful), and harmless (inoffensive and respectful). For example, one prompt might be a user asking for medical advice; two AI replies are given, one with a safe and accurate answer and another with an incorrect or unsafe suggestion, and the human marks the better one. These comparisons can be used to train a reward model or directly fine-tune an assistant.

**Purpose:** This dataset was created to enable Reinforcement Learning from Human Feedback (RLHF), aligning a language model with human preferences on those three axes. By training on this data, an LLM learns to prefer responses that humans found helpful and non-harmful.

**Relevance:** For the community, Anthropic's HHH dataset serves as a valuable open resource to replicate alignment techniques. Developers can use it to fine-tune other models or evaluate whether a model's responses match human ethical expectations. It explicitly targets safety (harmlessness) as well as general usefulness, embodying a multi-objective alignment approach.

**Notable:** Anthropic's researchers open-sourced this dataset to encourage transparency in alignment. It has approximately 52k comparison datapoints (with separate "harmless" and "helpful" preference sets) and has been used to train models like Anthropic's assistant and others to follow instructions safely.

**Licensing:** The data is under an open license (MIT) and hosted on [Anthropic's GitHub](https://github.com/anthropics/hh-rlhf) and [Hugging Face](https://huggingface.co/datasets/Anthropic/hh-rlhf). This means it can be freely used to train or evaluate models on human-aligned behavior, making it a cornerstone for safety fine-tuning.

## 9. Anthropic Red Team Adversarial Conversations

Another important open resource is the Anthropic red-teaming dialogues dataset (Ganguli et al., 2022). This dataset contains thousands of adversarial chat transcripts where humans tried to prompt a language model into unsafe or harmful behaviors.

**Content:** It includes 38,961 multi-turn conversations between a human (red-team attacker) and a language model assistant. The human goes through various strategies to elicit bad behavior—from asking disallowed content (e.g., hate speech, self-harm advice, violence) to attempting jailbreaks—and these dialogues are annotated. Many conversations have the model failing in some way (e.g., giving a harmful response) along with metadata on the failure mode.

**Purpose:** The dataset was created to probe LLM weaknesses and provide training data for making models more robust. Anthropic used these conversations to train their Constitutional AI model by learning to refuse or safe-complete in similar situations.

![Anthropic Red Team: Adversarial Attack Examples](/img/blog/safety-benchmarks/anthropic-redteam-example.svg)

**Relevance:** For researchers and engineers, this is a gold mine of real "jailbreak" attempts and model mistakes to study. It's used as an evaluation set to test if a new model still falls for the same traps, and as training data for adversarial robustness (via fine-tuning or reinforcement learning). Covering a wide range of harms (the authors list approximately 14 harm categories from self-harm to extremism) and creative exploits, it helps ensure an aligned model can handle "attacks" by malicious or clever prompts.

**Notable:** Collected by Anthropic via crowdworkers on Upwork/MTurk who were tasked with breaking a language model's defenses. Documented in "[Red Teaming Language Models to Reduce Harms](https://arxiv.org/abs/2209.07858)" and used in the [Constitutional AI](https://arxiv.org/abs/2212.08073) research.

**Licensing:** The conversation data is released under MIT License—meaning organizations can freely use it to test or improve their own models' safety. It's available on [Hugging Face](https://huggingface.co/datasets/Anthropic/hh-rlhf) (in the `red-team-attempts` folder) and [GitHub](https://github.com/anthropics/hh-rlhf). This real-world red-teaming data is invaluable for anyone building a secure LLM application.

## 10. ProsocialDialog

[ProsocialDialog](https://arxiv.org/abs/2205.12688) (Kim et al., 2022) is a unique open dataset focusing on teaching chatbots to respond to problematic content with positive, norm-following behavior. It's essentially a collection of example dialogues where one speaker says something unsafe or harmful, and the other responds in a constructive, prosocial manner.

**Content:** The dataset contains 58,000+ two-turn dialogues. Each conversation opens with a potentially unsafe user utterance (which could be toxic, harmful, or indicating bad intent), generated using GPT-3 to cover diverse scenarios. The second turn is a crowdworker-written response that addresses the unsafe content gracefully and with social norms in mind. For instance, if the user says something harassing or self-harmful, the assistant's reply might gently correct them or offer help, adhering to ethical guidelines. The responses were written to model prosocial behavior—they often contain polite refusals, safe coaching, or moral reasoning.

**Purpose:** ProsocialDialog was created to train conversational agents that can handle toxic or risky inputs in a safe way. Rather than just refusing, the assistant in these examples often provides a helpful intervention or sets boundaries in a friendly tone. This dataset directly supports fine-tuning LLMs for moral and safe dialogue skills.

**Relevance:** For LLM safety, ProsocialDialog fills the need for data on how a model should respond when the user is producing unsafe content. It's complementary to toxicity datasets—instead of detecting toxic output, it helps the model produce safer replies. This is crucial for chatbots that might face hate or extremist user inputs and need to answer responsibly.

**Notable:** Developed by Allen Institute for AI; first large-scale multi-turn "problematic content" dialogue set (EMNLP 2022). It has also been used in the REALLY benchmark and to train models like OpenAI's ChatGPT and others indirectly via public fine-tuning.

**Licensing:** The data is open for use under a CC BY 4.0 license. You can download it from [Hugging Face](https://huggingface.co/datasets/allenai/prosocial-dialog) (hosted by AI2) or the authors' GitHub. By including explicit prosocial responses, this dataset is a go-to resource for making AI assistants not just safe by avoidance, but safe by positive engagement.

## Using These Datasets in Practice

While these datasets provide invaluable benchmarks, evaluating your LLM against them can be challenging. Tools like [promptfoo](https://promptfoo.dev) make it easy to integrate these safety benchmarks into your testing pipeline.

### Red Team Evaluation

Promptfoo's red team feature allows you to automatically test your LLM against adversarial attacks similar to those in the Anthropic Red Team dataset:

![Promptfoo Red Team Evaluation Results](/img/blog/safety-benchmarks/promptfoo-redteam-evaluation.png)

### Comprehensive Risk Assessment

You can evaluate your model across multiple safety dimensions simultaneously:

![LLM Risk Assessment Dashboard](/img/blog/safety-benchmarks/llm-risk-assessment.png)

### Framework Compliance

Track your model's performance against industry-standard safety frameworks like MITRE ATLAS, NIST AI RMF, and OWASP LLM Top 10:

![Safety Framework Comparison](/img/blog/safety-benchmarks/safety-framework-comparison.png)

## Conclusion

Each of these open datasets plays a vital role in making LLMs safer and fairer, from filtering toxic language and reducing social biases to ensuring truthfulness and robustly handling adversarial prompts.

AI developers and security engineers can leverage these resources to evaluate their models' weaknesses and train improvements.

The fact that they are open-source means the community can build on them collaboratively, which is crucial as we push for more aligned and trustworthy AI systems.

By incorporating such datasets into your development and testing pipeline, you'll be following industry best practices for LLM safety and contributing to a more responsible AI ecosystem!

## Get Started

Ready to evaluate your LLM's safety? Check out [promptfoo's red team documentation](https://promptfoo.dev/docs/red-team/) to start testing your model against these industry-standard benchmarks.
