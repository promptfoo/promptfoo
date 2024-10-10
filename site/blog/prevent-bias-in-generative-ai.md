---
sidebar_label: Preventing bias & toxicity
image: /img/blog/bias/llm-bias-mitigation-diagram.svg
date: 2024-10-08
---

# Preventing Bias & Toxicity in Generative AI

When asked to generate recommendation letters for 200 U.S. names, ChatGPT [produced](https://www.jmir.org/2024/1/e51837) significantly different language based on perceived gender - even when given prompts designed to be neutral.

In political discussions, ChatGPT [responded](https://link.springer.com/article/10.1007/s11127-023-01097-2) with a significant and systematic bias toward specific political parties in the US, UK, and Brazil.

And on the multimodal side, OpenAI's Dall-E was much more likely to produce [images of black people](/blog/jailbreak-dalle/) when prompted for images of robbers.

There is no shortage of [other](https://hdsr.mitpress.mit.edu/pub/qh3dbdm9/release/2) [studies](https://arxiv.org/abs/2310.03031) that have found LLMs exhibiting bias related to race, religion, age, and political views.

As AI systems become more prevalent in high-stakes domains like healthcare, finance, and education, addressing these biases necessary to build fair and trustworthy applications.

![ai biases](/img/blog/bias/ai-bias.svg)

<!-- truncate -->

## Bias in generative AI: the basics

AI bias shows up as:

- Gender stereotypes in professions or traits
- Racial stereotypes or prejudices
- Political preferences
- Favoring dominant cultural perspectives
- Unfair portrayals of age groups
- Assumptions based on perceived economic status

These biases can cause real harm. A biased recruitment tool might unfairly prefer male candidates for leadership roles. A customer service chatbot could give worse responses to certain cultural groups.

Finding and measuring generative AI bias is hard due to language complexity and model size. Researchers use methods like:

1. Checking word associations
2. Comparing performance across demographics
3. Using adversarial datasets built to detect specific biases
4. Human review of outputs

Fixing generative AI bias requires work on data selection, system design, and thorough testing. There's work to be done on both the model and application level.

As "responsible AI" matures as a field, creating fairer models and applications remains a challenge.

## Why is bias in generative AI important?

Biased LLMs can have far-reaching consequences. When deployed in high-stakes applications like hiring or loan approval, these models risk perpetuating and amplifying existing societal inequalities.

The EU's AI Act classifies many LLM applications as high-risk, mandating bias mitigation measures. Companies face potential fines and reputational damage for discriminatory AI systems. Regulations may increasingly require proactive mitigation efforts.

Addressing bias is also an economic imperative:

- **Market reach**: Biased models risk alienating user groups.
- **Innovation**: Diverse perspectives lead to more creative and broadly applicable AI solutions.
- **Talent retention**: The use of AI is a hot topic within some companies (especially within tech), and employees are more likely to stay at companies committed to ethical AI practices.

As LLMs handle increasingly sensitive tasks, users need confidence that these systems won't discriminate against them.

In the long term, this trust is essential for AI adoption in important but sensitive sectors like healthcare, finance, and education.

## How to mitigate bias in large language models

Most generative AI and LLM developers work with pre-trained models, so we're going to focus on mostly on steps you can take at the application level.

![bias mitigation in LLMs](/img/blog/bias/llm-bias-mitigation-diagram.svg)

Here's how:

### 1. Diversify data

**Balance representation** in few-shot prompts. Include examples from different demographics to improve model generalization.

For RAG systems, **diversify your knowledge base**. Pull from varied sources covering different perspectives and cultures to ensure more inclusive outputs.

### 2. Implement bias detection

Use **counterfactual data augmentation** to create variations that flip attributes like gender or race, helping identify group-specific biases.

Deploy **bias detection tools** before development. Use sentiment analysis and named entity recognition to reveal skewed representations.

**Red team** your application to detect failure modes across a wide range of inputs. There are tools ([like Promptfoo](/docs/red-team/)) that can help you automate thousands of inputs and outputs.

Set up **guardrails** to catch biased outputs. These are typically provided as [APIs](/docs/red-team/guardrails/) that can classify inputs or outputs, and block, modify, or flag them for human review.

### 3. Fine-tune models

Not everyone is fine-tuning their own model, but if you are, improving your curated training dataset is the place to focus on.

If you're using **transfer learning** to adapt a model to a specific domain, you're potentially reducing irrelevant biases. However, biases from pre-trained models can persist even after fine-tuning on carefully curated datasets, a phenomenon known as ["bias transfer"](https://gradientscience.org/bias-transfer/).

In general, to **reduce known biases**, you can employ techniques like debiasing word embeddings or adversarial debiasing.

Be aware that simply debiasing your target dataset may not be sufficient to eliminate transferred biases, especially in fixed-feature transfer learning scenarios.

When fine-tuning, consider:

- The potential biases in your pre-trained model
- The transfer learning technique you're using (fixed-feature vs. full-network)
- At the end of the day, thorough evaluation of the fine-tuned model (e.g. using the [harmful bias red team plugin](/docs/red-team/plugins/harmful/)) is going to be necessary.

### 4. Incorporate logical reasoning

Integrate **structured thinking** into prompts. Guide the model to break down problems step-by-step with chain-of-thought reasoning.

Prompt models to **evaluate claims logically**, considering evidence and counterarguments. This reduces reliance on stereotypes or unfounded generalizations.

Implement **safeguards** against illogical or biased conclusions. Use fact-checking prompts or a knowledge bases to ensure that claims are grounded.

### 5. Evaluate thoroughly

Use a **fairness metric** that measure performance across different groups, not just accuracy. This can be done with a [classifier](/docs/configuration/expected-outputs/classifier/) grader using one of the many available models on [HuggingFace](https://huggingface.co/d4data/bias-detection-model).

**Test across many contexts and demographics**. You can construct test cases yourself, or you can use [**automated red-teaming**](/docs/red-team/) to stress-test your system. These automations generate thousands of adversarial inputs to uncover edge cases and unexpected biases at scale.

You should **freeze your models** to make sure that updates don't introduce unexpected behaviors.

But in general, bias mitigation isn't one-off. New jailbreaking techniques are constantly being discovered, so depending on your risk tolerance it's likely a good idea to run these tests periodically.

## Ongoing challenges in debiasing generative AI

Debiasing generative AI is an ongoing challenge that probably won't be solved anytime soon. Key issues include:

**Performance tradeoffs**: Reducing bias often impacts model capabilities. Filtering training data or constraining outputs often decrease overall performance.

**Intersectionality**: Most debiasing efforts target single attributes like gender or race. Addressing compound biases, e.g. those affecting Black women specifically, demands more sophisticated evaluation methods.

**Evolving language and norms**: Social norms shift rapidly, and words once considered neutral can become offensive.

Other persistent challenges:

- **Bias amplification**: LLMs can exaggerate subtle biases in training data.
- **Domain adaptation**: General debiasing techniques may fail in specialized fields like medicine or law.
- **Cultural context**: Bias perception varies between cultures, complicating global LLM deployment.
- **Explainability**: Pinpointing the source of biased outputs remains difficult, hindering targeted fixes.

Addressing these issues requires collaboration between AI researchers, ethicists, and domain experts. Progress will likely come through technical innovations and thoughtful governance.

## The path forward

Research is ongoing, but there are a few promising directions:

**Causal modeling**: Helps LLMs understand relationships beyond surface-level correlations, potentially reducing unfair associations.

**Federated learning**: Enables training on diverse, decentralized datasets while preserving privacy.

**Adversarial debiasing**: Actively removes biased features during training, though scaling remains challenging.

Above all, evaluation of models and applications (often referred to as "evals" or "red teaming") is crucial for teams that want to develop a strategy to identify and mitigate bias in their LLM applications.

If you're interested in learning more about detecting bias in your generative AI applications, we've got you covered. Please [get in touch](/contact/) or check out our [LLM red teaming guide](/docs/red-team/) to get started.
