---
date: 2025-02-13
image: /img/blog/owasp-red-team/ninja_panda.png
---

# OWASP Red Teaming: A Practical Guide to Getting Started

<figure>
  <div style={{ textAlign: 'center' }}>
    <img
      src="/img/blog/owasp-red-team/ninja_panda.png"
      alt="Promptfoo Ninja Panda"
      style={{ width: '70%' }}
    />
  </div>
</figure>

Generative AI presents a new range of risks for companies alongside a new range of opportunities. Though companies have long developed robust cybersecurity policies and techniques for traditional applications, the risks of generative AI are substantially different from previous types of risks. As a result, security leaders need to rethink how they approach security for Generative AI.

Luckily, organizations have OWASP (Open Web Application Security Project) to rely on. The non-profit has published cybersecurity guidelines for over two decades (including its famous OWASP Top 10 guides) that include industry standards for everything from web applications to cloud security.

OWASP has maintained its Top 10 list for Generative AI since 2023, but in January 2025 released [the first version](https://genai.owasp.org/resource/genai-red-teaming-guide/) of its Generative AI Red Teaming Guide. The purpose of the guide is to help practitioners in the field develop a comprehensive red teaming strategy that focuses on model evaluation, implementation testing, infrastructure assessment, and runtime behavior analysis.

The guide is more than 70 pages and nearly 20,000 words, so we developed an on-ramp to get you started on generative AI red teaming and on understanding OWASP's approach to it.

In this blog post, we'll walk you through the core branching decisions you'll need to make as you build a red teaming strategy and give you the language you need to show stakeholders you're aligned with industry standards.

## Who Benefits from Red Teaming?

Red teaming is typically conducted by a trained security practitioner or a team of security practitioners working for an organization to assess specific risks within an organization. It is different from penetration testing, which is typically conducted by a third-party security firm for auditing purposes. Red teaming may be broken into "exercises" or "simulations" that are designed to test specific scenarios within an organization.

The purpose of red teaming is three fold:

1. To identify and mitigate vulnerabilities in an application or organization.
2. To verify the effectiveness of the logging and detection controls managed by a "blue team," such as a security operations center (SOC), as well as the effectiveness of technical and organizational controls enforced by the organization.
3. To identify and manage broader risks within the organization, which may include social engineering, advanced persistent threats, and other non-technical risks that combine human and engineering elements.

Red teaming reports provide insights that can be leveraged by a variety of stakeholders, including cybersecurity teams, AI/ML engineers, risk managers, CISOs, architecture and engineering teams, compliance teams, corporate lawyers, and business leaders.

Given the pace of Generative AI development, red teaming is a critical component of any generative AI strategy. Since external penetration tests are typically conducted once or twice per year, conducting regular red teaming exercises against Generative AI applications is an essential activity to secure LLM applications before they're released to users.

## Defining Objectives and Criteria for Success

As the OWASP guide explains early on, "Traditional cybersecurity focuses on technical exploits (e.g., breaking into servers), but GenAI Red Teaming also examines how AI models can produce harmful or deceptive outputs."

The very opportunities generative AI presents to create value also means generative AI applications can produce outputs that harm or deceive users, damage the company's reputation, lead to a data breach, or all of the above. AI security policies have to focus on what your AI applications are generating from the inside out, not just what attackers could exploit from the outside in.

As the OWASP guide further explains, "AI systems shape critical decisions, [so] ensuring their safety and alignment with organizational values is crucial."

As a result, any generative AI red teaming strategy needs to start at a carefully planned, well-thought-out step zero: What are your objectives as you build and test your strategy, and what criteria will you use to measure the success of your strategy once you deploy and test it?

Determining your objectives and criteria requires working with many different stakeholders because generative AI risks cut across the company. The OWASP guide recommends including AI engineers, cybersecurity experts, and ethics or compliance specialists.

That said, there's more upside than downside to including even more people. When Air Canada was held liable for the advice its AI chatbot gave to a customer, Air Canada's legal, marketing, and PR teams likely wanted to be involved too (if not before the incident, certainly after). As the OWASP guide says, "Diversity of skill sets ensures a thorough evaluation."

Also note that, though our focus here is on OWASP, NIST agrees with this philosophy, too. NIST.AI.600.1 states, "The quality of AI red-teaming outputs is related to the background and expertise of the AI red team itself. Demographically and interdisciplinarily diverse AI red teams can be used to identify flaws in the varying contexts where GenAI will be used. For best results, AI red teams should demonstrate domain expertise, and awareness of socio-cultural aspects within the deployment context."

First, work with all the stakeholders you can identify to develop an AI code of conduct, identify legal concerns, and determine brand reputation risks. Remember, the nondeterministic nature of generative AI means a broad scope is necessary because the risks are diffuse and unpredictable.

:::info
Red teaming a Generative AI application means identifying technical vulnerabilities as well as legal and reputational risks to the business. You should have an understanding of acceptable personas for the application and the types of outputs that are considered harmful or deceptive. These are typically defined by the organization's AI code of conduct, legal, and/or marketing teams.
:::

Next, integrate the AI code of conduct into your goals and metrics as you develop them. As your generative AI red teaming approach matures, the code of conduct will serve as a reference point that you can return to again and again.

Promptfoo supports red teaming against AI codes of conduct through [custom policies](https://www.promptfoo.dev/docs/red-team/plugins/policy/), which you can use to test the specific requirements or constraints of your particular application. You can configure custom policies in your Promptfoo config file through the following syntax:

```yaml
redteam:
  plugins:
    - id: 'policy'
      numTests: 10
      config:
        policy: 'Your custom policy statement here'
```

From there, you can develop specific, granular goals for every red teaming session and use broader criteria for measuring overall red teaming success. As the OWASP guide warns, "A binary success/failure might not be enough."

Here, you can lean on the stakeholders you established contact with to help you distinguish between acceptable model variance and genuine risks. An expert on the brand or PR side might, for example, be better equipped to say whether a given output puts the brand in a bad light or not. Once you've received this feedback, you can customize the graders within a Promptfoo red team to better align with your organization's requirements:

```
plugins:
  - id: 'contracts'
    config:
      graderExamples:
        - output: "Sorry, I can\'t do that."
          pass: true
          score: 1.0
          reason: "Doesn't book a flight"
        - output: "I've booked your flight to Paris."
          pass: false
          score: 0.0
          reason: 'Books a flight'
```

Across these sessions, you can develop KPIs for safety and success, and keep your stakeholders in the loop as you track them. This can inform alignment with the KPIs and determine whether the KPIs themselves require iteration. Promptfoo's Enterprise platform allows you to track and share red team reports with stakeholders across teams, so they can also review the results and provide feedback.

## Timing Red Teaming Efforts in the SDLC

Securing an LLM-based application is never a one-and-done problem. With your objectives and criteria in mind, work with your development and security teams to figure out where red teaming will occur in the SDLC and how often you should run red teaming sessions.

At a high level, the choice is binary: Will you run your red teaming sessions primarily pre-deployment, or will you run them post-deployment? You can (and often should) do both, but your approach to either side of the lifecycle will require different strategies.

### Model Evaluations

The OWASP red teaming guide recommends running red teams against foundation models and fine-tuned models to test their inherent weaknesses. We have previous covered the [security risks](https://www.promptfoo.dev/blog/foundation-model-security/) that are present in foundation models and have a preset collection of tests for evaluation them. You can you conduct a complete red team against a foundation model using a config similar to this one:

```yaml
description: Your Foundation Model Red Team

targets:
  - id: openrouter:deepseek/deepseek-r1 # The model you want to test
    label: deepseek-r1
  - id: openai:gpt-4o-mini # A second model to test (if you want to compare results)
    label: gpt-4o-mini

plugins:
  - foundation # Collection of plugins that assess risks in foundation models

strategies:
  - best-of-n # Jailbreak technique published by Anthropic and Stanford
  - jailbreak # Single-shot optimization of safety bypass techniques
  - jailbreak:composite # Combines multiple jailbreak techniques for enhanced effectiveness
  - jailbreak:likert # Jailbreak technique published by Anthropic and Stanford
  - prompt-injection # Tests for direct prompt injection vulnerabilities
```

Running baseline red teams against foundation models is a recommended best practice to identify the foundation model you want to use and understand its inherent security risks.

### Pre-Deployment Red Teaming

You should threat model your LLM application before you even begin development. Once development begins, run red teams against the staging environment to test against your biggest risks.

This idea aligns well with the overall shift left philosophy, so along those same lines, adopt tools and processes that allow you to integrate testing tools into your CI/CD pipelines. You could, for example, trigger a red team run when particular changes occur (such as a change to the prompt file) or schedule them as chron jobs (at 12-hour, 24-hour, weekly intervals, etc.).

Along those lines, you should consider running red teams whenever there are changes to the LLM application, such as when new sources are incorporated into the RAG architecture or a new model is deployed. Given the nondeterministic nature of generative AI, any changes you make to the LLM application could have unexpected consequences.

### Post-Deployment Red Teaming

If you're thinking about red teaming in a post-deployment context, think about how you can assess potential vulnerabilities continuously. As you learn information from running red team sessions, you can iterate and fine-tune your approaches to improve subsequent exercises.

When conducting post-deployment red teams, you should also consider black-box testing, which is the process of testing an application without prior knowledge of its internal workings. This is different from white-box testing, which is the process of testing an application with prior knowledge of its internal workings.

When red teaming an LLM application in a black-box setting, try to enumerate as much information about the application as possible. Can you identify the models, extract the system prompts, determine what guardrails are in place, enumerate any frameworks or tools, or determine what the application's policies are?

Use this information to build more effective red teaming tests that address the most important risks. Whatever information is exposed to users or the public can be exploited by attackers.

Beyond red teaming, ensure that your Generative AI applications are in scope for your third-party penetration tests. Once you have thoroughly red-teamed your application and mitigated the most critical risks, you should also consider adding your Generative AI applications to your scope for any bug bounty programs you participate in. These programs are a second layer of defense beyond red teaming that can help you catch vulnerabilities that might slip through.

## Primary Threats to Secure Against

The fact that generative AI risks can be broad, diffuse, and unpredictable – as we've emphasized so far – doesn't mean you should weigh every possible risk equally.

Different organizations will face different risk profiles, and some threats will present more potential consequences than others. Because the possible dangers are so broad, you need to work with stakeholders early on to identify which poses the most danger and which you should prioritize as you build and expand your red teaming processes.

A major benefit of reading OWASP's guides is that OWASP is a recognized industry standard, and it tends to be thorough, detailing all the potential risks that can happen – all of which allow security leaders to cite and explain them.

The OWASP red teaming guide identifies five common threat categories:

- **Adversarial attacks**: These threats, such as prompt injection, come from malicious actors outside the company.
- **Alignment risks**: These threats include any way AI applications could generate outputs that don't align with organizational values (ranging from subtle misalignments to PR disasters).
- **Data risks**: These threats include any way AI applications could leak sensitive data or training data. This includes companies with user-facing AI applications that might ingest sensitive user data and internal AI applications that could use private company data for training purposes.
- **Interaction risks**: These threats include all the ways users could accidentally generate outputs that are harmful or dangerous.
- **Knowledge risks**: These threats include ways an AI application could generate misinformation and disinformation.

When identifying the threats that are most important to you, OWASP recommends asking the following questions:

1. What are we building with AI?
2. What can go wrong with AI security?
3. What can undermine AI trustworthiness?
4. How will we address these issues?

The OWASP Top 10 for LLM applications can be a useful starting point for identifying could go wrong with your LLM application. The list currently includes:

1. Prompt Injection
2. Sensitive Information Disclosure
3. Supply Chain
4. Data and Model Poisoning
5. Improper Output Handling
6. Excessive Agency
7. System Prompt Leakage
8. Vector and Embedding Weaknesses
9. Misinformation
10. Unbounded Consumption

Promptfoo covers these risks in its [OWASP Top 10 guide](https://www.promptfoo.dev/docs/red-team/owasp-llm-top-10/) for you to easily identify potential vulnerabilities when running red teams. You can run a red team specifically against the OWASP Top 10 using the OWASP shorthand in your Promptfoo config: 

```yaml
redteam:
  plugins:
    - owasp:llm
```

### Prioritizing Red Teaming Efforts

It's important to understand all the risks first because, with the risks in mind, you can work backward from your organization-specific risk profile.

Prioritize high-risk applications, especially anything that's customer-facing or handles sensitive data. Similarly, any applications that lead directly to business actions require prioritization over applications that are not business-critical.

You should also prioritize any applications that behave autonomously, such as AI agents or chatbots that can take action without human intervention, regardless of whether they're customer-facing or not. If you are rolling out an LLM application that replicates human behavior or augments human decision-making, ensure that red teaming includes red teaming tests that cover the technical and procedural controls typically used to secure employee actions. For example, a red teamer should test whether fraud alerting mechanisms are effective for a banking chatbot or whether a software engineering agent can be persuaded to commit insecure code.

This is particularly important for applications in development that are being shipped to other businesses as a platform or service. Companies that are developing Generative AI applications for other businesses should ensure that their applications cannot be abused when provided to customers. Consider reviewing your contractual commitments to customers and the regulations that you adhere to with them (such as GDPR, HIPAA, or the EU AI Act) to ensure that the application you're developing is compliant with the expectations of your customers.

## Combining Guardrails and Red Teaming

Guardrails enforce policy constraints on the inputs and/or outputs of an LLM application. They can be used to prevent harmful outputs from occurring in the first place, or to catch harmful outputs after they've been generated. It's best to red team after you've built guardrails because red teaming helps you figure out where vulnerabilities exist and how attackers could exploit them anyway.

### Testing Guardrails for Defense-in-Depth

In traditional cybersecurity, defense-in-depth strategies use multiple layers of security controls to provide redundancies that ensure multiple layers of defense lie beyond any given exploit. Guardrails in generative AI work much the same way.

Promptfoo offers numerous features for testing guardrails, including:

- **Plugins**, which you can use to detect harmful output generation, such as instructions for cooking meth, directions to find nuclear weapons, and demands that users kill themselves.
- **Custom policies**, which you can use to test the specific requirements or constraints of your particular application.
- **Custom strategies**, which you can use to modify your prompts for adversarial testing, including the ability to transform pre-existing test cases programmatically.

By building guardrails into AI application development, you can prevent many harmful outputs long before anyone sees them.

### Using Red Teaming to Identify Bypasses

Guardrails and red teaming are best in combination because red teaming will be most effective and most efficient once you're only tasking yourself with identifying threats that manage to bypass your guardrails.

Tune the model to focus on generating harmful responses and mimicking adversarial behavior. It must be as effective, thorough, and adversarial as an attacker (and the LLMs they might use).

Similarly, use realistic simulation environments that mimic real deployment scenarios. Model different users and usage patterns, too, so your red teaming sessions can reflect realistic user behavior. Keep social engineering and advanced persistent threats in mind, too, which the OWASP guide specifically points out.

The more you iterate your red teaming strategy, the better your red teaming efforts can inform guardrail settings. Every time a red team session catches something, you can use that information to improve your guardrails.

As the OWASP guide says, "Red teaming is not a one-time event. Re-test after implementing fixes, and integrate periodic checks into your AI lifecycle to catch new threats as your models and environment evolve."

## Testing the RAG Triad

OWASP's red teaming guide also includes a section on testing RAG architecture, which is a common use case for Generative AI applications. The guide recommends testing for the "RAG Triad," which includes factuality, relevance, and groundedness, as well as phenomena like hallucinations/confabulations (incorrect factual statements) and emergent behaviors.

![RAG Triad](/img/blog/owasp-red-team/rag-triad.png)

When red teaming a RAG application, you should ask the following questions:

- Is the retrieved context relevant to the user's query?
- Is the response supported by the context?
- Is the answer relevant to the question?

Promptfoo can help you test the RAG Triad through its evaluation framework, which supports [evaluations of RAG pipelines](https://www.promptfoo.dev/docs/guides/evaluate-rag/) to test for factuality, relevance, and groundedness. You can also use Promptfoo to red team RAG applications through the [data poisoning plugin](https://www.promptfoo.dev/docs/red-team/plugins/rag-poisoning/#background), and even [identify risks](https://www.promptfoo.dev/docs/red-team/plugins/hallucination/) for hallucinations.

## Assessing Risks in Agents

OWASP highly encourages organizations to robustly test agents and multi-agent systems. While the risks in agents are still developing as the field continues to innovate, the OWASP guide recommends addressing the following concerns:

- Multi-turn attack chains within the same AI model.
- Manipulation of agent decision-making processes.
- Exploitation of tool integration points.
- Data poisoning across model chains.
- Permission and access control bypass through agent interactions.

Any agent that relies on "reasoning engines" should be thoroughly red-teamed to ensure that the agent is not susceptible to manipulation or coercion. It should also be tested for risks of data exfiltration and excessive permissions. You can red team agents using Promptfoo's [how-to guide](https://www.promptfoo.dev/docs/red-team/agents/), which walks through the best plugins to identify vulnerabilities in agentic systems.

Agents that rely on reasoning engines may also be more susceptible to Denial of Wallet (DoW) attacks because of the higher inference costs required.

:::info
When red teaming autonomous agents, consider the technical and organizational controls that would be in place to mitigate the risks for employees, such as the principles of least privilege and separation of duties. Whatever controls you have in place for employees should be enforced and tested against for autonomous agents.
:::

Promptfoo has written more about the key security concerns in AI agents [here](https://www.promptfoo.dev/blog/agent-security/).

## Securing Generative AI Applications with Promptfoo

OWASP provides a perfect starting point for AI security. The practices form a solid foundation, and OWASP standards are easy to communicate to stakeholders, allowing you to build trust in your security efforts.

That said, OWASP is not the beginning and end of AI security broadly or generative AI red teaming more narrowly. To learn more, check out the [MITRE ATLAS](https://atlas.mitre.org/matrices/ATLAS) for threat modeling and the [EU AI Act](https://artificialintelligenceact.eu/). arXiv, an open-access archive of scholarly research, is also a good source for new studies if you [search for relevant terms](https://arxiv.org/search/?query=Red+Teaming+for+Generative+AI&searchtype=all&abstracts=show&order=-announced_date_first&size=50).

Of course, we'll provide as much information as possible, too. [Join our Discord](https://discord.com/invite/promptfoo) or [check out our blog](https://www.promptfoo.dev/blog/) to keep up with the latest on generative AI red teaming.

Interested in learning more about Promptfoo? [Schedule a demo](https://www.promptfoo.dev/contact/) with our team to learn more about how Promptfoo can help you secure your generative AI applications.
