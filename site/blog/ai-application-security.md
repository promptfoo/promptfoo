---
title: 'AI Application Security: Tutorial & Best Practices'
description: 'Learn the differences between AI application security and traditional application security, as well as the key threats and best practices for defending AI systems.'
keywords: [ai application security]
date: 2026-05-03
authors: [michael]
tags: [ai-security, red-teaming, best-practices, owasp, compliance-framework]
---

AI application security focuses on protecting Large Language Models (LLMs) and AI agents from threats that exploit their unique behaviors and components. Unlike traditional software, AI applications can generate unpredictable outputs, leak sensitive information, be tricked into ignoring their safety instructions, or invoke external tools in ways their designers never intended. Securing these systems demands strategies that go beyond those developed for deterministic web applications or APIs.

In this article, we examine the differences between AI application security and traditional application security. We review key threats and provide best practices for defending AI systems. We also discuss how frameworks and standards—such as OWASP, NIST, the EU AI Act, and MITRE ATLAS—guide AI security. Finally, we walk through an example using an open-source tool to run red-team adversarial attacks against a RAG-based chatbot to uncover its vulnerabilities.

<!-- truncate -->

## Summary of key AI application security concepts

| Concept                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| :---------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI security vs. traditional security**        | AI applications behave differently from conventional software. The nondeterministic outputs from AI models and their data-driven behavior introduce new attack dimensions and require different security mechanisms.                                                                                                                                                                                                                                                                         |
| **Adversaries and risks**                       | Threat actors range from opportunistic individuals to coordinated teams, targeting AI systems for misuse or sabotage. Risks include malicious prompts, poisoned data, model theft, and other novel AI-specific attack vectors.                                                                                                                                                                                                                                                               |
| **Top AI security threats**                     | AI applications face threats such as prompt injection, output misuse, training data poisoning, LLM resource-exhaustion attacks, supply-chain attacks, sensitive data leaks, insecure plugin use, excessive autonomy, overreliance on AI output, and model theft. These are detailed in frameworks like the OWASP Top 10 for LLM applications and the OWASP Top 10 for Agentic Applications for 2026.                                                                                         |
| **Prompt injection**                            | A prompt injection is a malicious or cleverly crafted input that causes an AI model to ignore its instructions or security constraints. These attacks can lead to unauthorized actions or disclosure of confidential data.                                                                                                                                                                                                                                                                   |
| **Jailbreaking**                                | Jailbreaking is a special case of prompt injection in which an attacker manipulates the AI to bypass safety filters or policies. Successful jailbreaks cause a model to operate outside its intended limits, potentially producing harmful or prohibited outputs.                                                                                                                                                                                                                            |
| **RAG exploits**                                | Attacks on retrieval-augmented generation (RAG) systems include poisoning the external data source or tricking the retrieval step. These exploits can make the AI system disclose sensitive documents or trust maliciously injected content.                                                                                                                                                                                                                                                 |
| **Tool and plugin exploits**                    | These exploits include misuse of AI plugins, external tools, or agentic pipelines. For example, an attacker might craft inputs that exploit an AI's tool usage, causing unauthorized file access, API calls, or even remote code execution if plugins aren't sandboxed.                                                                                                                                                                                                                      |
| **Agentic system risks**                        | Security challenges arise in autonomous or agent-based AI systems that make decisions in loops, leading to unchecked AI "agency" and unintended actions. Complex chains of prompts and tools require careful constraints and testing to prevent runaway behaviors.                                                                                                                                                                                                                           |
| **Data leakage and privacy**                    | Failure to prevent an AI from revealing sensitive information can be a serious problem. This includes models regurgitating private training data or leaking user-provided data in outputs. Privacy failures can violate regulations and erode user trust.                                                                                                                                                                                                                                    |
| **Best practices (design, dev, runtime, test)** | Security must be incorporated throughout the AI application development lifecycle: - At design time, plan for threat modeling and ethical guidelines. - During development, secure the model and data supply chain and perform AI-specific testing. - At runtime, ensure continuous monitoring, enforce guardrails, and apply strict access controls. - Continuously test and update defenses to keep up with new attack techniques. - Use standard frameworks for compliance and alignment. |

## What makes AI application security fundamentally different

The following are some reasons AI application security differs from traditional security at a basic level.

### Dynamic behavior vs. static logic

Unlike static application code, AI behavior depends on its training data and model parameters, which makes it less predictable and harder to verify. Small prompt changes can lead to hugely different outcomes. In short, AI models act as intelligent black boxes trained on data, and their behavior emerges from fixed parameters at inference time rather than being a result of static logic. This means that many long-standing security practices and processes don't apply directly or require significant adaptation.

### Expanded attack surface

Another fundamental difference is the expanded attack surface of AI systems. In addition to application code, it is necessary to secure model training data, pretrained weights, prompt instructions, and even third-party AI services or libraries. Vulnerabilities can creep in through data poisoning (e.g., tainted training or fine-tuning data) or model supply-chain attacks (e.g., a publicly available model that contains hidden backdoors designed to trigger harmful behavior under specific conditions).

### The shift to untrusted output validation

In classic apps, you trust your software's output unless it's been tampered with, but an AI model's response could be incorrect, toxic, or even dangerous; for example, an LLM might output an executable script or SQL commands. This means that AI outputs must themselves be treated as untrusted.

Without proper output handling, a system might blindly use an AI's response in a way that causes a security failure, like executing generated code or showing sensitive information to a user. This blurs the line between input and output security: You must sanitize and validate what the AI produces, not just what it consumes.

### Autonomous decision making in agentic AI

AI applications often incorporate a degree of autonomy and dynamic decision-making, unlike traditional software. Advanced AI agents can chain actions, call tools or APIs on their own, and modify their plans based on intermediate results. This autonomy is powerful but dangerous if unrestricted: The system might take unintended actions unless you impose strict guardrails.

## Adversary types and risks

Securing an AI application requires knowing who might attack it and why. The range of potential adversaries is broad, from curious hobbyists up to organized cybercriminals, and each adversary type may exploit AI in different ways:

- **Casual attackers and curious users:** These individuals might prompt your AI system just to see what it can be tricked into. These users publicly share jailbreak prompts or prompt injections just for the sake of fun and curiosity. Despite having limited resources, their findings, such as a leaked prompt or a way to bypass filters, can quickly spread and be widely exploited.
- **Malicious end-users or external hackers:** These users attempt to exploit the AI system for personal gain or disruption. They might attempt prompt injections to steal confidential information or feed harmful inputs to cause the AI to produce disallowed content. For example, an attacker could try to extract API keys or user data by cleverly querying an LLM.
- **Insiders or supply chain attackers:** This category includes adversaries who may be rogue employees or individuals with access who could manipulate the training data or model parameters to insert a backdoor. Similarly, a supplier might provide a pretrained model that has hidden malicious behavior. These attacks can be subtle, like poisoning a fraction of training data so the model reliably misbehaves only on certain triggers.
- **Advanced persistent threats (APTs) and nation-states:** Skilled and well-resourced actors may target organizations' AI for espionage or disruption. They might perform model extraction attacks by sending many queries to reverse-engineer your model's knowledge or even reconstruct it. They can steal intellectual property—the model itself or proprietary data it contains. APTs could also combine multiple tactics, such as poisoning your model via feedback mechanisms and simultaneously probing your AI's defenses with adversarial examples.

## Threats to AI application security

AI systems face risks that combine traditional software vulnerabilities with novel, model-specific behaviors. This section highlights key threats to AI application security. It briefly explains the threats listed in the OWASP Top 10 for LLM Applications (2025), followed by a more detailed discussion of key threat types.

### OWASP top 10 threats for LLM applications (2025)

The [OWASP Top 10 for LLM Applications (2025)](https://genai.owasp.org/llm-top-10/) is a community-maintained list highlighting the most critical vulnerability categories for AI/LLM systems. The table below summarizes these threats.

![OWASP Top 10 threats for LLM applications overview](/img/blog/ai-application-security/owasp-threats-overview.png)

| Risk designation | Risk name                        | Description                                                                                                                                                                                                                                                                                                                                              |
| :--------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM01            | Prompt Injection                 | Maliciously crafted inputs that trick the model into overriding system instructions, which can lead to unauthorized actions or data exfiltration; these can be direct, via user-driven input, or indirect, via poisoned external data such as malicious instructions in untrusted retrieved/ingested content (e.g., web pages, emails, docs, RAG chunks) |
| LLM02            | Sensitive Information Disclosure | The unintentional revealing of private data, credentials, or proprietary information in the model's output, a risk that is heightened as LLMs gain more access to internal data via RAG or long-term memory                                                                                                                                              |
| LLM03            | Supply Chain Vulnerabilities     | Exploitation of weaknesses in third-party components, including pretrained models, datasets, and specialized AI libraries, which can introduce hidden backdoors or malicious logic                                                                                                                                                                       |
| LLM04            | Data and Model Poisoning         | Attacks targeting the integrity of the model by tampering with the data used for pretraining, fine-tuning, or the retrieval-augmented generation (RAG) knowledge base                                                                                                                                                                                    |
| LLM05            | Improper output handling         | Failure to sanitize or validate LLM-generated content before passing it to downstream systems, which can lead to classic vulnerabilities such as cross-site scripting (XSS) or remote code execution (RCE)                                                                                                                                               |
| LLM06            | Excessive Agency                 | When an AI agent is granted too much autonomy or overly broad permissions (e.g., delete access to a database when only read access was required), it allows it to take unintended, harmful actions                                                                                                                                                       |
| LLM07            | System Prompt Leakage            | A specific form of disclosure in which an attacker extracts the internal "system instructions" that guide the model's behavior, thereby revealing business logic or security guardrails                                                                                                                                                                  |
| LLM08            | Vector and Embedding Weaknesses  | Attacks targeting the vector databases and embedding systems used in RAG, which can be exploited by malicious actors to manipulate search results or access unauthorized documents                                                                                                                                                                       |
| LLM09            | Misinformation                   | An LLM producing hallucinations, biased content, or factually incorrect information that leads to human error, legal liability, or reputational damage                                                                                                                                                                                                   |
| LLM10            | Unbounded consumption            | Resource exhaustion attacks (a form of denial of service), where an adversary sends complex or high-volume queries to drive up costs, degrade performance, or crash the application                                                                                                                                                                      |

There are various actions you can take to mitigate the effects of the above attacks, as explained in [this blog by Promptfoo](/blog/owasp-top-10-llms-tldr/).

### Jailbreaking

Jailbreaking is a type of attack in which an attacker crafts input that causes an AI model to bypass safety rules or behavioral policies. It is a specific form of prompt injection, but unlike direct attempts to override instructions, jailbreaks are more indirect and creative. For example, a user might trick the model into behaving as if it were another system that does not follow safety guidelines or may employ fictional scenarios to get around filters. These techniques can result in the AI producing harmful content, disclosing internal configuration details, or performing actions beyond its intended scope.

### RAG exploits

Retrieval-augmented generation (RAG) systems rely on external documents to enhance the model's responses. These systems introduce risks when the retrieval layer becomes a path for indirect attacks.

If a malicious actor can inject harmful content into the retrieval source, the model may incorporate it into its response. In many cases, the AI cannot distinguish between safe and unsafe retrieved text. This can lead to output that leaks sensitive data or performs unwanted actions.

Another risk is injection via the retrieved context. A document might include language that resembles a prompt or command. When inserted into the model's context window, this content may influence the model as if it came from the user.

### Tool and plugin exploits

Many AI systems include plugins or tool integrations to extend the model's capabilities; if not properly constrained, these extensions can become attack vectors. For example, if a tool allows command execution or file access, an attacker could inject a prompt that instructs the model to use the tool in a harmful way. The model may not recognize that it is being manipulated.

Tool abuse is especially risky in systems with multiple plugins or access to external systems. Attackers may try to chain actions across tools, exploiting unclear boundaries or missing validations.

### Agentic system risks

Agentic systems include models that operate over multiple steps, store memory, or plan actions independently. These systems are powerful but require careful security design.

One threat is that an attacker influences the agent's memory. If the model records previous inputs or decisions, malicious content may persist and influence future actions. For example, a prompt in one session might introduce misleading context that affects subsequent reasoning steps.

Another concern is a lack of control over action sequences. In multi-step agents, a prompt may not trigger an immediate exploit but might initiate a chain of events that leads to a failure or harmful output.

## Best practices for AI application security

### Design-time best practices

The design phase sets the foundation for secure AI systems because it is where you define what the system is allowed to do and how it should behave in adversarial or edge cases. Security decisions made here shape every other phase.

The following are some of the most important design-time best practices:

- Perform threat modeling focused on AI workflows, prompts, and model decisions.
- Identify misuse cases where the AI could be tricked or cause harm.
- Define ethical boundaries and system-level rules for safe behavior.
- Choose model architectures or providers that support transparency and control.
- Account for applicable regulations such as GDPR or the EU AI Act early on.

### Development and integration best practices

During development and integration, the focus shifts to securing inputs, tool access, and integration logic. The following are the best practices for securing AI applications in this phase:

- Validate pretrained models and datasets with checksums and trusted sources.
- Sanitize prompts and avoid risky string interpolations or hardcoded logic.
- Apply AI-specific posture management to track where and how AI is used.
- Write unit and integration tests for AI components, including malicious input handling.
- Enforce input/output boundaries between the model and external systems.

### Runtime and operational best practices

At runtime, your system needs guardrails that work in real time. The goal is to monitor, restrict, and log what the AI is doing and what it's allowed to access or produce by following these practices:

- Filter user inputs and model outputs for policy violations or harmful content.
- Log prompts, completions, and tool calls with appropriate redaction and security controls.
- Use telemetry to detect unusual behaviors like unexpected output formats.
- Apply rate limiting and cost guards to prevent abuse or denial-of-service attacks.
- Enforce strict permissions for sensitive AI features and fallback to humans when needed.

### Testing and validation best practices

Testing and validation are where you evaluate whether guardrails and other security controls function as expected and simulate adversarial behavior to detect failures. Red-teaming and adversarial testing should begin during development and staging, not just after deployment, so that vulnerabilities are caught before they reach end users.

- Use adversarial testing tools to simulate attacks against prompts, agents, and RAG pipelines.
- Red-team the AI system using internal or third-party experts.
- Automate the red-teaming and penetration testing process using tools like Promptfoo.
- Treat prompt changes and model updates as potential security events.
- Monitor for regression in model behavior or guardrails post-deployment.
- Build a feedback loop between testing results and system design changes.

### Using well-regarded frameworks for compliance and alignment

With the surge in AI application development, several frameworks have emerged to help organizations manage risks and demonstrate responsible deployment. These frameworks offer structure across various dimensions of AI governance, security, and lifecycle operations.

- **OWASP Top 10 for LLM Applications:** Explained in detail in a previous section.
- **NIST AI Risk Management Framework (AI RMF):** Created by the [National Institute of Standards and Technology](https://www.nist.gov/itl/ai-risk-management-framework), this framework promotes a structured approach to AI governance. It emphasizes identifying AI assets, assessing risks, implementing controls, and ongoing evaluation.
- **EU AI Act:** Proposed by the European Commission, the [EU AI Act](https://artificialintelligenceact.eu/) classifies AI systems by risk level. It mandates practices like transparency, safety testing, and human oversight for high-risk use cases.
- **MITRE ATLAS:** Maintained by [MITRE](https://atlas.mitre.org/), this threat knowledge base catalogs real-world adversary tactics used to attack AI systems. It supports threat modeling and helps security teams simulate how attackers might target model behavior or logic.

## How Promptfoo helps secure AI applications

Promptfoo is an open-source testing tool purpose-built for evaluating the security and reliability of LLM applications. Used by more than 300,000 developers and over 125 [Fortune 500 companies](https://www.insightpartners.com/ideas/promptfoo-scale-up-ai/), Promptfoo helps teams catch vulnerabilities through automated red teaming, regression testing, and standards-aligned reporting. Promptfoo also offers specialized plugins for regulated industries such as financial services, healthcare, insurance, and pharmacy, enabling domain-specific vulnerability testing.

Promptfoo helps protect AI applications in the following ways.

### AI red-teaming and adversarial testing

Promptfoo launches automated red-team attacks, including jailbreaks, prompt injections, RAG exploits, and tool-misuse attacks to expose vulnerabilities in AI applications. It generates adversarial inputs based on real-life application use cases, multi-turn conversation flow, customized agent behavior, and tool integrations. This includes multi-turn attack strategies such as [crescendo](https://arxiv.org/abs/2310.03684), [GOAT](/docs/red-team/strategies/goat/), and [Hydra](/docs/red-team/strategies/hydra/), which are especially effective at exposing vulnerabilities in agentic systems where context builds across interactions. These systematic attacks uncover vulnerabilities that may not be visible through isolated prompt testing.

### AI penetration testing at the application level

Unlike tools that only test prompts, Promptfoo evaluates full LLM workflows. It examines how RAG systems, toolchains, and memory components interact, uncovering risks arising from the combined behavior of the stack. This includes chaining attacks or tool misuse that only occur under specific sequences or conditions. Promptfoo also provides dedicated testing for MCP tool usage and agentic behaviors such as memory poisoning, directly addressing the tool and plugin exploit risks outlined earlier.

### Continuous evaluation and regression detection

Promptfoo integrates into CI pipelines to run security tests automatically during development, ensuring that updates to prompts, models, or system logic don't reintroduce known vulnerabilities.

### From findings to remediation

Promptfoo not only detects issues but also recommends targeted fixes by tracing the full sequence of inputs, model responses, and tool interactions that led to each vulnerability. Remediation guidance can range from simple prompt adjustments and tightened tool permissions to redesigning complex agentic workflows. The remediation report, as shown in the example in a later section, provides a prioritized list of fixes that teams can act on directly.

### Standards alignment

Promptfoo categorizes its findings against security frameworks such as OWASP Top 10 for LLMs, NIST AI RMF, the EU AI Act, and MITRE ATLAS. This helps teams ensure that their AI application complies with the latest security standards and frameworks.

## Promptfoo red-teaming example for RAG applications

Let's look at a simple example of how you can use Promptfoo's red-teaming capabilities to exploit security issues in your RAG application. The same technique applies to other types of AI applications as well.

We will run red-team adversarial attacks against a RAG-based chatbot used by a fictional IT company to retrieve HR policies. Developing the RAG chatbot is beyond the scope of this article, but you can download the code for developing and running the chatbot through this [Github repository](https://github.com/usmanmalik57/promptfoo-articles).

You can test the application first using the FastAPI Swagger interface. The interface allows you to add documents to a vector database via the upload route and query the RAG application using the query route. Here is an example call and the response from the RAG application.

![FastAPI Swagger interface example call and response](/img/blog/ai-application-security/rag-fastapi-swagger.png)

Promptfoo provides [detailed documentation](/docs/red-team/quickstart/) on how to red-team an AI application. To initialize a red team project, run _promptfoo redteam setup_, and you will see the following window in your local browser.

![promptfoo redteam setup browser window](/img/blog/ai-application-security/redteam-setup-window.png)

**Step 1: Select target type**

The first step is to name your application and select the target type, which can be any LLM provider, a chatbot application accessed through an API, or a simple HTTP/HTTPS endpoint. Since our RAG application is accessed via an HTTP endpoint, we select that option.

**Step 2: Set up target configuration**

The next step is to configure the target type, which determines the configuration settings. For HTTP endpoints, we need to set the HTTP URL, HTTP method, headers, content type, and request body. The following screenshot shows the configuration to access our RAG application.

![HTTP target configuration for the RAG application](/img/blog/ai-application-security/step2-target-configuration.png)

**Step 3: Provide application details**

Here, you provide the information Promptfoo will use to create red-team attacks. You can specify the purpose of your application, key features of the application, and the industry for which the application operates, the users of the application, and any other information that can help create robust adversarial attacks. You can also specify the permissions and the resources that your application can access.

**Step 4: Specify the plugins**

[Plugins](/docs/red-team/plugins/) provide a modular mechanism for testing different classes of risks and vulnerabilities in LLM models and LLM-powered applications. Each plugin generates adversarial inputs designed to target specific weakness categories.

Select the red-team plugins that best match the security risks and threat scenarios you want to evaluate. For the RAG application, you can select RAG plugins. You can also select plugins for various compliance frameworks.

![Selecting red-team plugins including RAG plugins](/img/blog/ai-application-security/step4-plugins.png)

**Step 5: Select red-teaming strategies**

[Strategies](/docs/red-team/strategies/) are approaches that systematically identify vulnerabilities in LLM applications. While plugins focus on generating malicious inputs, strategies control how those inputs are passed to the AI application to maximize the rate of attack success.

Select the red-team strategies that determine how attacks are generated and executed during testing. You can select the default quick, medium, and large strategies, or define custom strategies.

![Selecting red-team strategies](/img/blog/ai-application-security/step5-strategies.png)

**Step 6: Review and run**

Finally, review your red-teaming configurations and run the application. You have two options:

- Save the YAML file and run the promptfoo redteam run command via the CLI in the same directory as the YAML file.
- Run the tests directly in a browser.

![Review and run red-team configuration](/img/blog/ai-application-security/step6-review-run.png)

**Step 7: Results and monitoring**

The final step is to review the results. You can directly see the results in your browser if you run the tests there. For the command line, the URL containing evaluations will be provided at the end of the tests.

For our RAG application, we see the following results:

![Red-team results for the RAG application](/img/blog/ai-application-security/step7-results.png)

You can see the prompts used in the tests, the success rate, and the output of each test. For example, the output above shows that the red-teaming test failed because the RAG application disclosed the international configuration and environment details of the vector database.

You can see detailed vulnerability and remediation reports by clicking the corresponding links at the top right. Here is the vulnerability report for our RAG application.

![Vulnerability report for the RAG application](/img/blog/ai-application-security/step7-vulnerability-report.png)

Finally, here is the remediation report. You can see risks, vulnerabilities, and remediation types.

![Remediation report showing risks and remediation types](/img/blog/ai-application-security/step7-remediation-report.png)

You can also view action items to improve your application's security.

![Action items to improve application security](/img/blog/ai-application-security/step7-action-items.png)

You can see how Promptfoo not only identifies various vulnerabilities but also suggests remediation details on how to secure your AI application.

## Final thoughts

AI application security is fundamentally different from traditional application security. The nondeterministic nature of LLM models, dependency on training data, untrusted context, and increasing system autonomy make it challenging to secure AI applications using traditional application security techniques. As LLM-based systems become more integrated into production workflows, addressing issues such as prompt injection, RAG exploits, and agent misuse becomes of paramount importance.

Tools like Promptfoo help secure AI applications through automated AI red-teaming and penetration testing capabilities, enabling teams to identify vulnerabilities early and validate defenses as applications evolve.
