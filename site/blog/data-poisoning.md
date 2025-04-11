---
sidebar_label: Defending Against Data Poisoning Attacks on LLMs—A Comprehensive Guide
image: /img/blog/data-poisoning/poisoning-panda.jpeg
date: 2025-01-07
---

# Defending Against Data Poisoning Attacks on LLMs: A Comprehensive Guide

Data poisoning remains a top concern on the [OWASP Top 10 for 2025](https://owasp.org/www-project-top-10-for-large-language-model-applications/). However, the scope of data poisoning has expanded since the 2023 version. Data poisoning is no longer strictly a risk during the training of Large Language Models (LLMs); it now encompasses all three stages of the LLM lifecycle: pre-training, fine-tuning, and retrieval from external sources. OWASP also highlights the risk of model poisoning from shared repositories or open-source platforms, where models may contain backdoors or embedded malware.

When exploited, data poisoning can degrade model performance, produce biased or toxic content, exploit downstream systems, or tamper with the model’s generation capabilities.

Understanding how these attacks work and implementing preventative measures is crucial for developers, security engineers, and technical leaders responsible for maintaining the security and reliability of these systems. This comprehensive guide delves into the nature of data poisoning attacks and offers strategies to safeguard against these threats.

<!--truncate-->

<figure>
  <div style={{ textAlign: 'center' }}>
    <img
      src="/img/blog/data-poisoning/poisoning-panda.jpeg"
      alt="Promptfoo Panda as a chemist"
      style={{ width: '70%' }}
    />
  </div>
</figure>

## Understanding Data Poisoning Attacks in LLM Applications

Data poisoning attacks are malicious attempts to corrupt the training data of an LLM, thereby influencing the model's behavior in undesirable ways. These attacks typically manifest in three primary forms:

1. **Poisoning the Training Dataset**: Attackers insert malicious data into the training set during pre-training or fine-tuning, causing the model to learn incorrect associations or behaviors. This can lead to the model making erroneous predictions or becoming susceptible to specific triggers. They may also create backdoors, where they poison the training dataset to cause the model to behave normally under typical conditions but produce attacker-chosen outputs when presented with certain triggers.
2. **Poisoning Embeddings**: External sources provided as context to the LLM through RAG may be poisoned to elicit harmful responses.
3. **Poisoned Open-Source Models**: Attackers upload poisoned models into open-source or shared repositories like Hugging Face. These models, while seemingly innocuous, may contain hidden payloads that can execute malicious code.

The technical impact of data poisoning attacks can be severe. Your LLM may generate biased or harmful content, leak sensitive information, or become more susceptible to adversarial inputs. The business implications extend beyond technical disruptions. Organizations face legal liabilities from data breaches, loss of user trust due to compromised model outputs, and potential financial losses from erroneous decision-making processes influenced by the poisoned model.

## Common Mechanisms of Data Poisoning Attacks

Attackers employ several sophisticated methods to poison LLMs:

### Compromising External Sources

Attackers can inject malicious content into knowledge databases, forcing LLM applications to generate harmful or incorrect outputs. Rather than using obvious malicious content, attackers may create authoritative-looking documentation that naturally blends with legitimate sources. For example, a job seeker may upload a poisoned resume into a job application system that instructs the LLM to recommend the candidate.

### Injecting Malicious Data Into Training Sets

Attackers may contribute harmful data to public datasets or exploit data collection processes. By inserting data that contains specific biases, incorrect labels, or hidden triggers, they can manipulate the model's learning process. Exposed API keys to LLM repositories [can leave organizations vulnerable](https://www.darkreading.com/vulnerabilities-threats/meta-ai-models-cracked-open-exposed-api-tokens) to data poisoning from attackers.

### Manipulating Data During Fine-Tuning

If your organization fine-tunes pre-trained models using additional data, attackers might target this stage. They may provide datasets that appear legitimate but contain poisoned samples designed to alter the model's behavior.

### Backdoor Attacks

By embedding hidden patterns or triggers within the training data, attackers can cause the model to respond in specific ways when these triggers are present in the input. Research from Anthropic [suggests](https://arxiv.org/pdf/2401.05566) that models trained with backdoor behavior can evade eradication during safety training, such as supervised fine-tuning, reinforcement learning, and adversarial training. Larger models and those with chain-of-thought reasoning are more successful at evading safety measures and can even recognize their backdoor triggers, creating a false perception of safety.

### Poisoned Models

Attackers may [upload poisoned models](https://www.darkreading.com/application-security/hugging-face-ai-platform-100-malicious-code-execution-models) into open-source or shared repositories like Hugging Face. These models, while seemingly innocuous, may contain hidden payloads that can execute reverse shell connections or insert arbitrary code.

## Detection and Prevention Strategies

To protect your LLM applications from [LLM vulnerabilities](https://www.promptfoo.dev/docs/red-team/llm-vulnerability-types/), including data poisoning attacks, it's essential to implement a comprehensive set of detection and prevention measures:

### Implement Data Validation and Tracking to Mitigate Risk of Data Poisoning

- **Enforce Sandboxing**: Implement sandboxing to restrict model exposure to untrusted data sources.
- **Track Data Origins**: Use tools like OWASP CycloneDX or ML-BOM to track data origins and transformations.
- **Use Data Versioning**: Use a version control system to track changes in datasets and detect manipulation.

### Monitor Model Behavior to Identify Data Poisoning

Regularly monitor the outputs of your LLM for signs of unusual or undesirable behavior.

- **Implement Tracing**: LLM tracing provides a detailed snapshot of the decision-making and thought processes within LLMs as they generate responses. Tracing can help you monitor, debug, and understand the execution of an LLM application
- **Use Golden Datasets**: Golden datasets in LLMs are high-quality, carefully curated collections of data used to evaluate and benchmark the performance of large language models. Use these datasets as a "ground truth" to evaluate the performance of your models.
- **Test with Adversarial Examples**: [Use Promptfoo](https://www.promptfoo.dev/docs/red-team/quickstart/) to test your models with adversarial inputs to evaluate its robustness against potential attacks.
- **Deploy Guardrails**: Use guardrails as a defense-in-depth measure to prevent the LLM from generating outputs that violate your policies.

### Limit Access to Training Processes to Prevent Data Poisoning

Restrict who can modify training data or initiate training processes.

- **Lock Down Access**: Restrict access to LLM repositories and implement robust monitoring to mitigate the risk of insider threats.
  - Access to training data should be restricted based on least privilege and need-to-know. Access should be recertified on a regular cadence (such as quarterly) to account for employee turnover or job changes.
  - All access should be logged and audited. Developer access should be limited to the minimum necessary to perform their job and access should be revoked when they leave the organization.
- **Audit Logs**: Keep detailed logs of data access and modifications to trace any unauthorized activities connected to your training data or LLM configurations.

### Enforce Supply Chain Security to Identify Poisoned Models

- **Vet Your Sources**: Conduct thorough due diligence on model providers and training data sources.
  - Review model cards and documentation to understand the model's training processes and performance. You can learn more about this in our [foundation model security](https://www.promptfoo.dev/blog/foundation-model-security/) blog post.
  - Verify that models downloaded from Hugging Face [pass their malware scans](https://huggingface.co/docs/hub/en/security-malware) and [pickling scans](https://huggingface.co/docs/hub/en/security-pickle).

### Red Team LLM Applications to Detect Data Poisoning

- **Model Red Teaming**: Run an initial [red team](https://www.promptfoo.dev/docs/red-team/) assessment against any models pulled from shared or public repositories like Hugging Face.
- **Assess Bias**: In Promptfoo's eval framework, use Promptfoo's [classifier assert type](https://www.promptfoo.dev/docs/configuration/expected-outputs/classifier/#bias-detection-example) to assess grounding, factuality, and bias in models pulled from Hugging Face.
- **Test RAG Poisoning**: Test for susceptibility to RAG poisoning with [Promptfoo's RAG poisoning plugin](https://www.promptfoo.dev/docs/red-team/plugins/rag-poisoning/).

Implementing these [AI red teaming techniques](https://www.promptfoo.dev/docs/guides/llm-redteaming/) will help safeguard your models against various threats.

## Learning from Real-World Examples and Case Studies

Understanding real-world instances of data poisoning attacks can help you better prepare:

- **Data Poisoning Attacks in LLMs**: Researchers [studied the effect](https://pmc.ncbi.nlm.nih.gov/articles/PMC10984073/) of data poisoning on fine-tuned clinical LLMs that spread misinformation about breast cancer treatment.
- **Evasive Backdoor Techniques**: Anthropic [published a report](https://arxiv.org/pdf/2401.05566) about evasive and deceptive behavior by LLMs that can bypass safety guardrails to execute backdoor triggers, such as generating insecure code from specific prompts.
- **Poisoned Models on Shared Repositories**: Researchers at JFrog [discovered ML models](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/) on Hugging Face with a harmful payload that created a reverse shell to a malicious host. There have also been poisoned LLMs [uploaded to public repositories](https://blog.mithrilsecurity.io/poisongpt-how-we-hid-a-lobotomized-llm-on-hugging-face-to-spread-fake-news/) that purposefully hallucinate facts.
- **RAG Poisoning on Microsoft 365 Copilot**: A security researcher [leveraged prompt injection](https://embracethered.com/blog/posts/2024/m365-copilot-prompt-injection-tool-invocation-and-data-exfil-using-ascii-smuggling/) through malicious documents that led to data exfiltration.

Analyzing these examples and benchmarking LLM performance can help you identify weaknesses and improve model robustness. These examples highlight the importance of data integrity and the need for vigilant monitoring of your models' training data and outputs.

## Take Action with Promptfoo

Promptfoo is an open-source tool that tests and secures large language model applications. It identifies risks related to security, legal issues, and brand reputation by detecting problems like data leaks, prompt injections, and harmful content.

Get started red teaming your LLMs by checking out our [Red Team Guide](https://www.promptfoo.dev/docs/red-team/).
