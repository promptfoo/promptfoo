---
sidebar_position: 1
sidebar_label: Intro
title: LLM red teaming guide (open source)
---

# LLM red teaming

LLM red teaming is a proactive approach to finding vulnerabilities in AI systems by simulating malicious inputs.

As of today, there are multiple inherent security challenges with LLM architectures. Depending on your system's design, e.g. [RAG](/docs/red-team/rag/), [LLM agent](/docs/red-team/agents/), or [chatbot](/docs/red-team/llm-vulnerability-types/), you'll face different types of vulnerabilities.

Almost every LLM app has potential issues with generation of off-topic, inappropriate, or harmful content that breaches business policies or other guidelines. As architectures become more complex, problems can arise in the form of information leakage and access control (RAG architectures), misuse of connected APIs or databases (in agents), and more.

The purpose of red teaming is to identify and address these vulnerabilities before they make it to production.

In order to do this, we need to systematically generate a wide range of adversarial inputs and evaluate the LLM's responses. This process is known as "red teaming".

By systematically probing the LLM application, you can produce a report that quantifies the risk of misuse and provides suggestions for mitigation.

:::tip
Ready to run a red team? Jump to **[Quickstart](/docs/red-team/quickstart/)**.
:::

<div style={{maxWidth: 760, margin: '0 auto'}}>
![llm red team report](/img/riskreport-1@2x.png)
</div>

## Red teaming is a core requirement of AI security

Red teaming is different from other AI security approaches because it provides a quantitative measure of risk _before_ deployment.

By running thousands of probes and evaluating the AI's performance, developers can make informed decisions about acceptable risk levels in offline testbeds. Many organizations build this into their development cycle and into processes like CI/CD.

This process is how the big foundation labs - OpenAI, Anthropic, Microsoft, and Google - evaluate their models before they release them to the public. For a while, AI red teams were confined to these elite labs. Now, AI red teaming is becoming more common as tools proliferate and best practices emerge.

This is a new field and standards are emerging around the world, ranging from [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) to [NIST's AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) and the [EU AI Act](https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation-on-artificial-intelligence).

From what we've seen so far, most regulations/standards support a systematic benchmarking/red teaming process that quantifies risk via testing prior to deployment.

## How LLM red teaming works

The process of red teaming LLMs generally requires some degree of automation for a comprehensive evaluation. This is because LLMs have such a wide attack surface and are stochastic in nature (i.e. they are not consistent from one generation to the next).

A systematic approach looks like this:

1. Generate a diverse set of adversarial inputs
2. Run these inputs through your LLM application
3. Analyze the outputs for vulnerabilities or undesirable behaviors

Once a process is set up, it can be applied in two primary ways:

- **One-off runs**: Generate a comprehensive report that allows you to examine vulnerabilities and suggested mitigations.
- **CI/CD integration**: Continuously monitor for vulnerabilities in your deployment pipeline, ensuring ongoing safety as your application evolves.

The magic moment for managing AI risk usually comes after an organization is able to set up some continuous measurement of AI risk: whether through CI/CD, internal requirements, or some other form of scheduled runs.

<div style={{maxWidth: 760, margin: '0 auto'}}>
![llm security continuous monitoring](/img/continuous-monitoring.png)
</div>

## Model vs application layer threats

In general, threats fall into two main categories: model ("foundation") or application layer. While there is some overlap, it helps to be explicit in your red teaming goals which side you want to test.

When research labs like OpenAI or Anthropic train a new model, they have internal (and external) testers stress-test the chat-tuned model for safety and research purposes. Model-layer vulnerabilities include things like ability to produce:

- Prompt injections and jailbreaks
- Hate speech, bias, toxicity, and other harmful outputs
- Hallucinations
- Copyright violations
- Specialized advice (medical, financial)
- Results that exhibit excessive agency or exploit overreliance
- PII leaks (from training data)

On the other hand, there are classes of vulnerabilities that only manifest once you've connected the model to a larger application environment. These include:

- Indirect prompt injections
- PII leaks (from context, e.g. in RAG architectures)
- Tool-based vulnerabilities (e.g. unauthorized data access, privilege escalations, SQL injections - depending on API and database access)
- Hijacking (aka off-topic use)
- Data/chat exfiltration techniques (e.g. markdown images, link unfurling)

Most applications integrate existing models rather than requiring their own dedicated ones. For this reason, application layer threats are often the focus of red teaming efforts for LLM-based software, as they are likely to cause the greatest technical risks.

## White box vs black box testing

White box testing of LLMs involves having full access to the model's architecture, training data, and internal weights. This enables highly effective attack algorithms like [greedy coordinate descent](https://github.com/llm-attacks/llm-attacks) and [AutoDAN](https://arxiv.org/abs/2310.04451).

The downside of these white box attacks is that they tend to be slow and are adapted to specific characteristics of the model. Additionally, most developers are not building with models that are exposed via their weights, so this approach is not practical for most use cases.

On the other hand, black box testing treats the LLM as a closed system, where only inputs and outputs are observable. This approach simulates real-world scenarios where attackers don't have insider knowledge.

Both methods have their merits in red teaming:

- White box testing can uncover deeper, structural vulnerabilities.
- Black box testing is more representative of real-world attack scenarios and can reveal unexpected behaviors.

For most developers and AppSec teams, black box testing is the more practical approach, because in most cases testers do not have access to model internals. A black-box approach more easily incorporates the real world infrastructure associated with RAGs and agents.

<div style={{maxWidth: 760, margin: '0 auto'}}>
![llm testing: white-box vs black-box](/img/docs/llm-testing-diagram.svg)
</div>

## Common threats

The number of threats AI apps face can be overwhelming because AI apps, often by definition, offer generative features with unpredictable results. As Tomasz Tunguz, Venture Capitalist at Theory, has [written](https://www.linkedin.com/posts/tomasztunguz_product-managers-designers-working-with-activity-7183149701674807296-4fAn/), "With AI, the rules have changed. Non-deterministic ML models introduce uncertainty & chaotic behavior."

This non-deterministic behavior has implications on the product side, but it also has implications for those of us who are more paranoid.

### Privacy violations

To state the obvious: Gen AI apps depend on massive data sources, by definition, and adversaries who could gain access to those data sources would pose massive threats to the companies behind the apps.

Even if user privacy isn't directly violated, companies with AI apps likely don't want outsiders to know the training data they use. But, in a [2022 paper](https://arxiv.org/pdf/2202.03286), researchers found it was relatively easy to use an adversarial LLM to reveal another LLM's training data (while this applies only to base models and fine-tunes, it's relevant to RAGs with additional data in context).

<div style={{maxWidth: 250, margin: '0 auto'}}>
![Training data leakage](/img/docs/training-data-leakage.png)
</div>

That same paper shows, however, that with similar methods, privacy violations can be much more direct – ranging from an LLM sharing phone numbers it shouldn't to sharing individual email addresses.

<div style={{maxWidth: 600, margin: '0 auto'}}>
![Training data leakage 2](/img/docs/training-data-leakage2.png)
</div>

A leak of personally identifiable information (PII) is bad in itself, but once adversaries have that PII, they could use the stolen identities to gain unauthorized access to internal companies' resources—to steal the resources, blackmail the company, or insert malware.

Many of the best use cases for AI apps involve adapting general-purpose models to specific contexts by fine-tuning them on specific data sources. This entire use case could be shuttered if companies don't feel comfortable connecting private data sources to vulnerable AI apps.

### Prompt injections

LLMs present a whole new range of vulnerabilities that will look familiar to many security teams but present novel risks and novel strategies for addressing them.

Prompt injections, for example, resemble SQL injections but present differently. Prompt injections are a type of attack that [chains untrusted user input](https://embracethered.com/blog/posts/2024/m365-copilot-prompt-injection-tool-invocation-and-data-exfil-using-ascii-smuggling/) with trusted prompts built by a trusted developer. (Importantly, this is [different than jailbreaking](https://simonwillison.net/2024/Mar/5/prompt-injection-jailbreaking/), which we'll get into in the next section).

In a 2023 [Black Hat presentation](https://i.blackhat.com/BH-US-23/Presentations/US-23-Greshake-Compromising-LLMS.pdf), security researchers ran through numerous examples of prompt injections working in the wild. With one prompt injection, researchers hijacked an LLM, convinced the user to disclose their names, and got the user to click on a link that redirected them to a malware website, for example.

<div style={{maxWidth: 650, margin: '0 auto'}}>
<img src="/img/docs/prompt-injection-example.png" />
</div>

Of course, though researchers analogize prompt injections to more traditional SQL and shell injections, AI-based SQL and shell injections are still possible, too.

In a [2023 paper](https://arxiv.org/abs/2308.01990), another team of researchers showed that prompt-to-SQL injections can be very effective. In the paper, the team evaluated 7 LLMs and demonstrated "the pervasiveness of P2SQL attacks across language models."

Shell injections are similar. AI apps that haven't been through red teaming are frequently susceptible to attacks that execute unauthorized shell commands.

### Jailbreaking

Jailbreaking refers to attacks that intentionally subvert the foundational safety filters and guardrails built into the LLMs supporting AI apps. These attacks aim to make the model depart from its core constraints and behavioral limitations.

Even the newest, least technical ChatGPT user becomes an adversary in at least one sense when they eventually think: "How can I make this thing ignore its rules?"

Jailbreaking can be surprisingly simple—sometimes as easy as copying and pasting a carefully crafted prompt to make a Gen AI app do things it's fundamentally not supposed to do.

For example, Chris Bakke, founder of Interviewed, convinced a Chevrolet dealer's ChatGPT-powered customer service app to sell him a 2024 Chevy Tahoe for $1 with a simple prompt that [gave the bot a new objective](https://x.com/ChrisJBakke/status/1736533308849443121).

<div style={{maxWidth: 400, margin: '0 auto'}}>
![Chevy chatbot conversation 1](/img/docs/chevy1.png)
![Chevy chatbot conversation 2](/img/docs/chevy2.png)
</div>

The example is funny, but this situation demonstrates a much deeper issue: the ability to override the model's core constraints.

Research shows that automated methods can go much deeper and present much worse risks. In a [2023 paper](https://arxiv.org/abs/2312.02119), researchers found that a Tree of Attacks with Pruning (TAP) method, which involves iteratively refining prompts using tree-of-thought reasoning, can successfully jailbreak targets without requiring impractical brute force.

"In empirical evaluations," the researchers write, "We observe that TAP generates prompts that jailbreak state-of-the-art LLMs (including GPT4 and GPT4-Turbo) for more than 80% of the prompts using only a small number of queries."

In a [different paper](https://arxiv.org/abs/2307.15043), other researchers demonstrate a similar vulnerability by finding and adding suffixes to queries that make it more likely LLMs will respond to requests for objectionable content, bypassing their built-in ethical constraints.

And it's not just about wording inputs differently. In a [2024 paper](https://arxiv.org/pdf/2402.11753), researchers showed that ASCII art could successfully get around AI guardrails, demonstrating yet another method to subvert foundational safety measures.

<div style={{maxWidth: 650, margin: '0 auto'}}>
![ASCII art prompt injection](/img/docs/artprompt.png)
</div>

### Generation of Unwanted Content

Separate from jailbreaking, AI apps can sometimes generate unwanted or unsavory content simply due to the broad knowledge base of the foundation model, which may not be limited to the specific use case of the app.

When AI apps generate such content, it can seem like a relatively small problem when isolated – similar to blaming Google for your searches. But at scale, in terms of access to the content and distribution of the content, more severe risks start to emerge.

Content promoting criminal activities, for example, can make the AI app that generated the content (and the company behind it) look bad. Google might point the way to crime-related information that someone posted, but the issue is much worse when your company gives criminals step-by-step instructions.

Similarly, misinformation can feel small on one level and cataclysmic on another. At a big enough scale, users relying on a hallucinating AI app could amount to mass delusion. But the steps in between are dangerous, too, ranging from merely incorrect information (that makes the company look foolish) to misleading, unsafe information (that could really hurt users).

<div style={{maxWidth: 650, margin: '0 auto'}}>
![Eating glue pizza](/img/docs/eating-glue.png)
</div>

AI developers work to ensure these kinds of results don't emerge, but it's always a tight race between implementing safeguards and the model's vast knowledge base potentially producing undesired outputs.

And yes, someone did actually [eat the glue pizza](https://www.businessinsider.com/google-ai-glue-pizza-i-tried-it-2024-5).

## Best practices

Based on our experience as practitioners deploying LLMs, we recommend the following best practices for effective red teaming:

### Step 1: Define your strategy

Before running a red team, define a systematic process that encompasses:

1. **Vulnerability focus**: Identify which types of vulnerabilities are most critical for your application. This will depend on your use case (e.g., [RAG](/docs/red-team/rag/), [agents](/docs/red-team/agents/), chatbots) and industry.

2. **Timing in development cycle**: Decide where in your process red teaming will occur. Checkpoints to consider include:

   - **Model testing**, which can happen even before you start building the application, and is especially important when fine tuning.
   - **Pre-deployment testing**, once the model has been hooked up to the application, tools, databases, etc.
   - **Continuous integration/deployment (CI/CD) checks** to catch regressions and anomalies.
   - **Post-deployment monitoring** to establish a feedback loop and maintain an understanding of how your application is behaving in production.

3. **Resource allocation**: Balance the depth of testing with available time and resources. Certain automated attack strategies consume a large number of tokens, and a single red team can range anywhere from a few cents to hundreds of dollars!

4. **Regulatory compliance**: Consider any industry-specific or regional requirements (e.g., GDPR, HIPAA) as well as standards (e.g. NIST AI RMF, OWASP LLM).

### Step 2: Implementation

Once you've defined your objectives, your process will probably look like this:

1. **Generate diverse adversarial inputs**:

   - Create a wide range of inputs targeting your identified vulnerability types.
   - Automated generation tools are a huge help, especially to cover a breadth of use cases. But human ingenuity is still useful, especially for known problem areas.

2. **Set up evaluation framework**:

   - Choose or develop a tool for systematic LLM testing.
   - Integrate with your development pipeline if applicable.

3. **Execute tests**:

   - Run your adversarial inputs through your LLM application.
   - Ensure you're testing in an environment that closely mimics production. It's best to test end-to-end - so you can stress-test full tool access and/or guardrails.

4. **Collect and organize results**:
   - Store outputs in a structured format that can be subsequently analyzed. Most evaluation frameworks will do this for you.

### Step 3: Analysis and remediation

1. **Review flagged outputs**:

   - Set a regular cadence for reviewing test results. This could involve both the security and development teams in the review process.

2. **Prioritize vulnerabilities**:

   - Not all issues are created equal. There's a fuzzy line between AI security and AI safety issues, and as alluded to above, some fall on the model side versus the application side.
   - Most teams we talk to find it most productive to focus on technical security vulnerabilities, as the foundation model problems are improving over time as AI research advances and tend to have smaller impact.

3. **Develop mitigation strategies**:

   - For each priority vulnerability, brainstorm potential fixes.
   - This might include prompt engineering, additional safeguards, or architectural changes.

4. **Implement and verify fixes**:

   - Apply chosen mitigations and re-run the evaluation suite to confirm the effectiveness of your solutions.

5. **Continuous improvement**:
   - Regularly update your test suite with new adversarial inputs, and regenerate the redteam inputs to test variations and updated methods.

## Case Study: Discord's Clyde AI

Discord's launch of Clyde AI in March 2023 is a perfect example of why thorough red teaming is important. Clyde, an OpenAI-powered chatbot, was meant to help users by answering questions and facilitating conversations. But its high-profile rollout also came with lessons learned.

### Deployment

Discord played it safe by introducing Clyde gradually. They only made it available to a small percentage of servers at first, which allowed them to test and refine as they went. At first, things looked promising. A [survey](https://subo.ai/blog/discord-survey-clyde-mysterious-disappearance/) found that 74% of Discord moderators who used Clyde were happy with it.

### Vulnerabilities in the wild

It didn't take long for users to find ways to game the system. Famously, a Discord user discovered the GPT "[grandma exploit](https://www.polygon.com/23690187/discord-ai-chatbot-clyde-grandma-exploit-chatgpt)," a classic jailbreak attack. Users figured out they could trick Clyde into spitting out forbidden content by framing requests as roleplaying scenarios. For instance:

![clyde jailbreak](/img/docs/clyde-jailbreak.jpg)

This kind of prompt let users sidestep OpenAI's alignment and Clyde's content filters, posing several risks:

- **Policy Violations**: Clyde generated content that breached Discord's guidelines, potentially exposing users to harmful or inappropriate material.
- **Reputational Damage**: The exploit gained attention, leading to negative publicity and raising concerns about Discord's commitment to user safety.
- **User Trust Erosion**: Users began to question the reliability of Clyde and Discord's ability to protect them from harmful content.

### Red teaming and evaluation

There were many teams involved in this report and others in the same vein: engineering, product, security, legal, policy, and marketing.

- Adopting an evaluation framework (in fact, they used an early version of Promptfoo!). An evaluation framwork is a way to automatically run inputs through an LLM and test its outputs.
- Setting a convention in which every prompt/workflow change required an evaluation.
- Making evaluations as automatic and frictionless as possible.

This gave all stakeholders a quantitative, data-driven way to measure changes in risk and flag unusual fluctuations.

In addition to red teaming, Discord deployed passive moderation and observability tools to detect trends in adversarial inputs, and developed dedicating reporting mecahnisms.

### Key Takeaways

This case highlights several practical aspects of AI red teaming:

1. **Comprehensive pre-deployment testing**: Test a wide range of adversarial inputs to uncover potential exploits before launch.
2. **Gradual rollouts**: Limit potential damage and gather real-world usage data through controlled, incremental deployment.
3. **Continuous monitoring**: Develop a culture of continuous testing and risk monitoring to catch regressions.
4. **User feedback loop**: Encourage users to report issues and feed these issues back into your red teaming setup.

### Other examples

Promptfoo is an open-source software that breaks down LLM failure modes into adversarial testers known as "[plugins](/docs/category/plugins/)". Here are some examples of plugins:

- [Harmful content](/docs/red-team/plugins/harmful/#examples): Examples of hate speech, offensive content, and other harmful outputs triggered in leading AI models.
- [Broken object-level authorization (BOLA)](/docs/red-team/plugins/bola/#example-test-cases): Test cases for unauthorized access to resources belonging to other users.
- [Broken function-level authorization (BFLA)](/docs/red-team/plugins/bfla/#how-it-works): Prompts attempting to perform actions beyond authorized scope or role.
- [Competitor endorsement](/docs/red-team/plugins/competitors/#example-test-cases): Scenarios where AI might inadvertently promote competing products or services.

See [LLM vulnerability types](/docs/red-team/llm-vulnerability-types/) for more info on model and application vulnerabilities.

## What's next?

To get started and run your first red team, see the [quickstart guide](/docs/red-team/quickstart/).
