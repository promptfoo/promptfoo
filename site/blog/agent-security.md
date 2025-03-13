---
date: 2025-02-14
image: /img/blog/agent-security/panda_tools.png
---

# Understanding AI Agent Security

In an earlier blog post, we discussed the [use-cases for RAG architecture](https://www.promptfoo.dev/blog/rag-architecture/) and its secure design principles. While RAG is powerful for providing context-aware answers, what if you want an LLM application to autonomously execute tasks? This is where AI agents come in.

<!-- truncate -->

## What Are AI Agents?

LLM agents are systems that dynamically determine their own processes to execute specific tasks. Unlike workflows where execution is predetermined in code, agents have autonomy and knowledge that allows them to make nuanced decisions based on inputs.

We're seeing a wave of new agentic systems entering the market, particularly through [startups](https://www.ycombinator.com/companies/industry/ai-assistant) solving complex industry problems. While these agents may be called "AI assistants" or "AI co-workers," the core principle remains: they are model-driven systems with autonomy to execute tasks.

Under the hood, agentic systems require four fundamental capabilities:

- A model capable of reasoning and planning
- Retrieval mechanisms
- Tools and APIs
- Memory systems

![AI Agent components](/img/blog/agent-security/ai-agent-architecture.svg)

AI agents can range from simple (like querying weather data) to complex (like customer service chatbots accessing restricted data and taking actions on behalf of users). Foundation labs like OpenAI and Anthropic provide basic examples in their cookbooks—such as Anthropic's [customer service agent](https://github.com/anthropics/anthropic-cookbook/blob/main/tool_use/customer_service_agent.ipynb) with client-side tools.

When we think about LLM architecture, there are distinct layers of complexity:

- **Basic Model Conversations**: Direct user interaction with a model through prompts and responses
- **RAG-Enhanced Queries**: Model interactions enhanced with context from vector databases
- **User-to-Agent Interactions**: Users engaging with autonomous AI agents
- **RAG-Enabled Agents**: Agents that can access knowledge bases and execute functions
- **Agent-to-API Communication**: Agents interacting with external APIs
- **Agent-to-Agent Collaboration**: Multiple agents working together to achieve goals

Real-world applications often combine multiple layers. For example, a travel chatbot might handle basic conversations, retrieve customer profiles (RAG), modify reservations (user-to-agent), and book restaurants through external reservation systems (agent-to-API). As agents continue to proliferate in the wild, we should expect to see more and more complex agentic systems and inter-agent engagement.

## Core Components of AI Agents

All AI agents must be granted a degree of autonomy to make decisions and execute on tasks. This requires a model that can reason and plan, retrieval mechanisms to access information, tools and APIs to execute on tasks, and memory systems to store information.

### Reasoning and Planning

Agents must evaluate problems and identify necessary actions to achieve goals. This involves understanding context, breaking down complex tasks, and determining the optimal sequence of actions. Not all models are capable of reasoning and planning, so it's important to select a model that is capable of handling the complexity of the task at hand.

### Tools

In order for an AI agent to execute on tasks, it must invoke tools. These tools could be as simple as Python functions or as complex as third-party APIs and database queries. When creating an AI agent, you will need to register the tools with the agent.

Providing these tools does not mean the AI agent will invoke those tools at every response. Instead, you can structure the AI agent to “reason” and determine whether the tool should be invoked. For some models, you can also force the model to call a function.

In Anthropic’s example customer service agent, the user sends a message that subsequently triggers the LLM to “think.”

The LLM has access to three client-side tools: get_customer_info, get_order_details, and cancel_order. Based on the user message, it must determine which tool it should use to execute the task. In this example, it determines that it should call the get_customer_info function and returns the appropriate, structured response.

![Anthropic Customer Service Agent](/img/blog/agent-security/anthropic_code.png)

### Memory

AI agents require memory to overcome the challenges of stateless LLM architecture. There are typically two types of memory that an AI agent uses:

- **Short-term memory**: This is the memory of the current conversation. It is used to store the conversation history and the context of the task at hand.
- **Long-term memory**: This is the memory of the AI agent’s knowledge. It is used to store the knowledge of the world and the knowledge of the task at hand.

### Retrieval and Knowledge

Retrieval is the process of accessing information from a knowledge source, such as a vector database. AI agents may need access to a vector database to retrieve relevant information, whether that’s searching for stored information that is required to execute tasks, or to retrieve relevant information that will help the agent complete the function successfully.

AI agents may also be granted access to databases, such as SQL databases, to retrieve information requested by the user or another agent.

## Agentic Architecture

### Single Agent

Single-agent architecture is best suited for well-defined processes and narrowly-defined tools. When engaging with a single agent, it will plan and complete tasks sequentially, meaning that the operation of the first step must be complete before the next step can be performed.

### Multi-Agent

![Multi-Agent Architecture](/img/blog/agent-security/architecture_diagram.png)

Multi-agent systems are ideal for tasks requiring multiple perspectives or parallel processing. These can be organized in two ways:

#### Horizontal Hierarchy

- Agents work collaboratively without designated leadership
- Excellent for feedback-heavy tasks
- Risk of unfocused "chatter" between agents

#### Vertical Hierarchy

- One agent leads, others support
- Clear division of labor
- Reduces distractions but may face communication bottlenecks

## Security Risks with AI Agents

Depending on the type of agent architecture, AI agents may remain susceptible to security risks common for RAG architecture, such as broken access control, data poisoning, and prompt injection. In addition to these risks, AI agents could also introduce other types of vulnerabilities.

### Agent Hijacking

One of the largest risks against agentic systems is the [newly-coined concept](https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations) of “agent hijacking,” where AI agents are exploited through direct or indirect prompt injection. Agentic hijacking is a type of chained exploit that requires multiple vulnerabilities to pose a serious risk. The first is a fundamental misconfiguration of the AI agent to allow excessive privilege or autonomy. The second is the presence of direct or indirect prompt injection from untrusted user input. When chained, AI agents can be “hijacked” into executing malicious commands from users.

Direct prompt injections occur when a user directly interacts with the AI agent (such as through a chatbot) and includes malicious instructions that bypass the LLM system’s original intent. Indirect prompt injection occurs through poisoning an LLM agent’s retrieval system, such as including a poisoned document in a RAG knowledge base that is subsequently retrieved by the LLM.

Together, excessive agency and a prompt injection attack can force an AI agent to behave in unintended or malicious ways, such as sending well-crafted phishing messages on behalf of an attacker, escalating privileges to retrieve unauthorized data to the user, or providing malicious or illegal information back to a user.

### Excessive Agency

AI agents with excessive access (or unrestricted access) to tools, APIs, and databases can pose tremendous risks for data exfiltration and sensitive information disclosure. They can also introduce the risk of [unbounded consumption attacks](https://www.promptfoo.dev/blog/unbounded-consumption/) against databases and APIs if rate limiting and input sanitation aren’t applied. This is caused by a lack of robust authorization mechanisms, overly-permissive tool calling, and lack of input sanitation.

![Excessive Agency](/img/blog/agent-security/sql_injection.png)

Above is an example of SQL injection in an AI agent. Since the prompts are not sanitized and the AI agent has unrestricted access to the database, it can run SQL commands to dump contents of the database.

### Denial of Wallet (DoW) Attacks

By design, AI agents require more sophisticated reasoning and planning to execute on tasks. Due to the computational requirements, these models are inherently more expensive than simpler models that are intended for chat completion, with inference for reasoning models such as OpenAI’s o1 [almost 150% more expensive](https://openai.com/api/pricing/) than gpt-4o. Users with access to a company’s agentic systems can abuse or mislead agentic systems to spiral in their reasoning or unnecessarily complete tasks, subsequently leading to tremendously large bills from inference providers.

### Multi-Turn Conversational Attacks

Not all attacks can be executed in a single prompt. LLM agents may be vulnerable to multi-step attacks where the attacker sequences through a conversation until it is able to complete an attack. These multi-turn, conversational strategies are effective at coercing agents into generating harmful output or executing on tasks in stateful applications by gradually convincing the AI agent to act against its intended purpose over time.

![Multi-Turn Conversational Attacks](/img/blog/agent-security/conversation.png)

An example of multi-step conversational attacks can be seen using Promptfoo itself, where we use reasoning for agentic attacks against other LLMs through multi-turn conversations in strategies such as [GOAT](https://www.promptfoo.dev/docs/red-team/strategies/goat/) and [Crescendo](https://www.promptfoo.dev/docs/red-team/strategies/multi-turn/).

### Inadvertent (But Harmful) Actions

While not malicious in intent, AI agents may inadvertently take harmful actions with the resources they’re provided. For example, a misconfigured coding agent could commit insecure code to production. Without proper controls in place to mitigate the risk of agents in production systems, these agents could disrupt a platform’s operability or availability, expose sensitive data such as API tokens, or introduce insecure code that could subsequently be exploited by an attacker.

AI agents in fields such as customer service could also make mistakes such as providing commitments at the wrong price that a company is [legally forced to honor](https://www.bbc.com/travel/article/20240222-air-canada-chatbot-misinformation-what-travellers-should-know). It could also provide erroneous information about a company’s policies or draw the wrong conclusions based on the facts it’s provided.

AI agents could also be susceptible to fraud and should be monitored for anomalous activity. For example, an attacker could insist that it did not receive a package delivery and force the agent to call a tool to cancel the delivery or issue a refund.

### Traditional Jailbreaks

AI agents are not immune from traditional jailbreaks. Among the vulnerabilities listed above, AI agents still remain susceptible to baseline jailbreak attempts, which could force the agent to disclose harmful information or bypass inherent safety guardrails. It’s important to note that deploying agentic systems does not eradicate classes of vulnerabilities from simpler LLM systems but compounds risks due to the multi-layered architecture that agents require. Therefore, AI agents should still have defense-in-depth measures that would be applied to conversational AI or foundation models, such as red teaming and guardrails.

## Agentic Security Best Practices

In many ways, AI agents should be treated the same way as security teams would handle access control for employees within an organization. Agents, like humans, make decisions and execute on tasks based on their working memory, the tools at their disposal, and the knowledge sources they have access to. Like employees, AI agents generally want to perform tasks well in alignment with larger goals, but can also be prone to making mistakes, disclosing information, or falling for social engineering attacks.

A best practice for AI agents is to enforce the principles of least privilege and need-to-know. An AI agent’s access (including to vector databases, tools, and third-party APIs) should be audited and recertified on a regular cadence. All agentic activity should be logged and monitored with alerting set up for suspicious activity, and AI agents should be deprecated when no longer in use.

Consider the following controls when deploying AI agents:

### Tool Inventory

- Maintain an inventory of what tools, functions, APIs, and databases are exposed to AI agents.
- List the intended tasks of the AI agents and what should be achieved through access to tools.
- Document the risk-level of AI agents based on their authorized tasks (read, write, delete, etc), the sensitivity level of the data that the AI agents are accessing (confidential, highly-sensitive, PHI, PCI, PII), and the level of exposure (public, internal).

### Least Privilege Authorization

- Enforce least privilege for the tools that an AI agent is authorized to use. For example, if an AI agent only needs to run queries on a SQL database, it should not have DELETE, UPDATE, or DROP capabilities. Better yet—the agent should be constrained to prewritten queries or prepared statements.
- Equally as important, enforce least privilege for the users who can access the tool.
- Restrict access to AI agents and terminate access when necessary.

### Sanitize Input and Output

- Implement validation and sanitation for both prompts and output from AI agents.
- Enforce data loss prevention (DLP) technologies to mitigate risk of sensitive data exfiltration
- Implement API request signing and verification to prevent tampering

### System Prompt Configuration

- Assume that all information in the system prompt is public.
- Implement strict separation between private data and prompt context.
- Instruct the agent to not reveal any information from its prompt or context and implement guardrails.

### Sandbox Agents

- Consider maintaining AI agents in secure, isolated environments with restricted access to resources and functions.
- Separate AI agents from production environments and networks to mitigate risk of SSRF attacks.

### Enforce An AI Code of Conduct

- Collaborate with legal, marketing, compliance, and security teams to establish and enforce an AI code of conduct for AI agents.
- Implement red teaming to ensure that AI agents do not breach the AI code of conduct or other AI governance policies.

### Monitoring and Alerting

- Implement monitoring and alerting for AI agents to detect anomalous behavior.
- Enforce any secondary controls that you would apply to other systems or employees, such as fraud alerting mechanisms and multi-factor authentication for sensitive transactions.

## Red Teaming AI Agents with Promptfoo

Promptfoo supports red teaming against AI agents through tailored strategies and plugins. We’ve even [compiled a guide](https://www.promptfoo.dev/docs/red-team/agents/) specifically for red teaming AI agents.

Curious about learning more about agentic red teaming? [Contact us](https://www.promptfoo.dev/contact/) to schedule a demo.
