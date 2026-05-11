---
title: 'How Do You Secure RAG Applications?'
description: 'RAG systems add retrieval, authorization, and data-poisoning risks beyond the base model. Learn the failure modes and controls that matter.'
image: /img/blog/rag-architecture/promptfoo_panda_rag.png
keywords:
  [
    RAG security,
    retrieval augmented generation,
    AI security architecture,
    data poisoning prevention,
    vector database security,
    RAG vulnerabilities,
    AI application security,
  ]
date: 2024-10-14
authors: [vanessa]
tags: [technical-guide, best-practices, rag]
---

# How Do You Secure RAG Applications?

<div style={{ textAlign: 'center' }}>
    <img src="/img/blog/rag-architecture/promptfoo_panda_rag.png" alt="red panda using rag" style={{ width: '50%' }} />
</div>

In our [previous blog post](https://www.promptfoo.dev/blog/foundation-model-security/), we covered the security risks of foundation models. That is only the first layer of the application. Once a team adds proprietary or current data through fine-tuning or retrieval, the attack surface changes.

Most organizations will not train a frontier model from scratch. They will start with a foundation model, then adapt it with prompts, fine-tuning, retrieval, or some combination of the three. The security question is where that extra context comes from and who is allowed to see it.

<!-- truncate -->

## Why Knowledge Cutoff Matters

Foundation models encode patterns from their training data. That gives them broad knowledge, but not automatic access to later events or private enterprise data.

Providers often disclose a knowledge cutoff in model cards. For example, [Llama 3.2's model card](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/MODEL_CARD.md) lists August 2023. A model can still answer questions about later events, but without fresh context those answers are more likely to be incomplete or fabricated.

The difference is easy to see when comparing a historical question with a question about current news.

![gpt-4o napoleon question](/img/blog/rag-architecture/napoleon_question.png)

In this response, GPT-4o is drawing on information stored in its weights. The answer may be useful, but it is not a citation and it is not guaranteed to be correct. For factual workflows, the model output still needs verification.

For recent events, the application needs another source of truth. In the example below, ChatGPT searches the web before summarizing the latest inflation news.

![gpt-4o CPI question](/img/blog/rag-architecture/CPI_question.png)

That retrieval step is the important distinction. Instead of relying only on what the model learned during training, the application fetches current context and includes it at inference time.

Fine-tuning and RAG solve different problems:

| Approach                       | Best For                                       | Main Limitation                                 |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| Foundation model               | General-purpose capability                     | No built-in access to private or current data   |
| Fine-tuning                    | Durable behavior or domain-specific patterns   | Not a source of live or citable facts           |
| Retrieval Augmented Generation | Current or private knowledge at inference time | Retrieval becomes part of the security boundary |

## The Case for Fine-Tuning

Fine-tuning is useful when the thing you want to improve changes slowly enough to live in the model weights. It can teach a model domain terminology, output formats, or task-specific behavior without requiring that context in every prompt.

That makes it a good fit for relatively stable domains. In a [research paper](https://arxiv.org/html/2404.14779v1) published in April 2024, researchers observed improved medical knowledge performance in fine-tuned models compared with the base model.

![medical results](/img/blog/rag-architecture/finetuning_medical.png)

The full-parameter fine-tuned model outperformed the base model on medical subsets of MMLU such as college biology, college medicine, medical genetics, and professional medicine.

But static knowledge is not enough for every task. A clinician may need the latest patient record, a current medication list, or hospital-specific policy. Those belong in retrieval, not in the model weights.

## The Case for Retrieval Augmented Generation

Retrieval Augmented Generation (RAG) adds external context at inference time. Instead of asking the model to memorize everything, the application fetches relevant documents or records and passes them with the user request.

Without RAG, here's what a basic chatbot flow would look like.

<!-- Centering and resizing the image -->
<div style={{ textAlign: 'center' }}>
    <img src="/img/blog/rag-architecture/basic_input_flow.png" style={{ width: '50%' }} alt="basic input flow" />
</div>

With RAG, the flow might work like this:

<!-- Centering and resizing the image -->
<div style={{ textAlign: 'center' }}>
    <img src="/img/blog/rag-architecture/basic_rag_flow.png" style={{ width: '65%' }} alt="basic_rag_flow" />
</div>

In a simple RAG flow, the application turns the user request into a retrieval query, fetches relevant context, and sends both the request and the context to the model.

The value is not just convenience. Retrieval lets an application work with data that is too large, too fresh, or too access-controlled to place in a prompt by hand.

Consider a support chatbot for a smart thermostat. A customer asks for help but does not know the model number. After the customer is authenticated, the application can retrieve the purchase record, identify the thermostat, pull the matching manual, and summarize relevant support history. The model is useful because the retrieval layer supplied the right facts at the right time.

## Key Components of RAG Orchestration

A typical RAG system has four moving parts:

1. **Orchestration layer**: Coordinates user input, retrieval, metadata, and downstream tools. LangChain and LlamaIndex are common examples.
2. **Retrieval tools**: Fetch relevant context from vector stores, search systems, APIs, or databases.
3. **Embedding model**: Converts documents into vectors for similarity search.
4. **Large language model**: Produces the final answer from the user input and retrieved context.

Security problems usually appear in how those parts are connected, not in any one component by itself.

## Security Concerns for RAG Architecture

### Proper Authentication and Authorization Flows

If the application exposes non-public data, authentication is the starting point. It gives you two things:

- Enforces accountability and logging
- Partially mitigates risk of Denial of Wallet (DoW) and Denial of Service (DoS)

Authentication alone is not enough. Retrieval still needs authorization controls that decide which documents each user may access:

1. **Document Classification**: Assign categories or access levels to documents during ingestion
2. **User-Document Mapping**: Create relationships between users/roles and document categories
3. **Query-Time Filtering**: During retrieval, filter results based on user permissions.
4. **Metadata Tagging**: Include authorization metadata with document embeddings
5. **Secure Embedding Storage**: Ensure that vector databases support access controls

Those controls can be expressed through standard authorization models:

1. **Role-Based Access Control (RBAC)**: Users are assigned roles (e.g. admin, editor, viewer) and permissions are granted based on those roles.
2. **Attribute-Based Access Control (ABAC)**: Users can access resources based on attributes of the users themselves, the resources, and the environment.
3. **Relationship-Based Access Control (ReBAC)**: Access is defined based on the relationship between users and resources.

RAG often centralizes documents from systems with different permission models. That means you need a common authorization schema and permission metadata stored alongside the indexed content.

At query time, use both:

1. **Pre-Query Filtering**: Enforce permission filters for vector search queries before execution
2. **Post-Query Filtering**: Ensure that search results map to authorized documents

### Never Trust the User

Assume that anything stored in the retrieval layer may eventually reach a model response. If the application does not need sensitive data in the index, do not put it there.

If sensitive data must be indexed, enforce access at the storage layer and query with user-scoped credentials rather than a global service credential.

Never rely on a prompt instruction to enforce authorization. The application should verify access before retrieval and only pass authorized context to the model.

## What Could Go Wrong?

If retrieval ignores authorization, the LLM endpoint becomes another path to cross-tenant access. That may be acceptable for a public help-center bot. It is not acceptable for a multi-tenant product or any system handling PII, PHI, or internal documents.

The test strategy is familiar from traditional application security. Build a matrix of tenants, users, and documents, then verify that every retrieval path respects those boundaries. In a RAG application, the LLM endpoint is simply another way to exercise that access control surface.

![threat model diagram](/img/blog/rag-architecture/RAG_threat_model.png)

User prompts should never be trusted within an authorization flow, and you should never rely on a system prompt as the sole control for restricting access.

### Prompt Injection

RAG does not remove the usual [prompt injection](https://www.promptfoo.dev/blog/prompt-injection/) risk. If the application relies on system prompts alone to restrict behavior, a malicious user can still try to override those instructions directly.

### Context Injection

Context injection is the retrieval-side version of the same problem. The malicious instructions arrive through retrieved content instead of through the user's message. A poisoned web page, document, or support ticket can influence the model once it is added to context. There are [research papers](https://arxiv.org/html/2405.20234v1) that outline these techniques in detail.

### Data Poisoning

If users can upload content that later becomes retrievable by others, the index becomes a poisoning target. Malicious documents can introduce false facts, misleading instructions, or retrieval spam that looks no different from trusted content once embedded.

### Sensitive Data Exfiltration

RAG systems can leak sensitive data for the same reason any application can: broken authorization. The difference is that the prompt becomes one more interface for probing those boundaries.

Output guardrails can reduce accidental exposure, but they are not a substitute for access control. If a system should never reveal a field, the safest design is to avoid indexing it in the first place and enforce object-level permissions before retrieval.

### Context Window Overflows

Every LLM has a finite context window. A RAG application has to fit at least four things into it:

1. System instructions
2. Retrieved context
3. User input
4. Generated output

An attacker who can flood retrieval with irrelevant text can crowd out more important instructions or evidence. Larger context windows make this less likely, but they do not remove the need to rank, limit, and inspect retrieved content.

<a id="mitigating-controls-for-rag-1"></a>

## Mitigating Controls for RAG

Start by testing the complete retrieval path, not just the base model. A [Promptfoo red team eval](https://www.promptfoo.dev/docs/guides/evaluate-rag/) configured for your RAG environment can help expose the highest-risk failure modes.

The most important controls are concrete:

1. **Enforce authorization before retrieval**: Filter by tenant, role, and object permissions before documents reach the model.
2. **Keep unnecessary secrets out of the index**: Avoid storing PII or other sensitive fields unless the use case truly requires them.
3. **Treat retrieved text as untrusted input**: Separate instructions from content and inspect the full assembled context, not just the user message.
4. **Constrain retrieval**: Limit, rank, and deduplicate context so poisoned or irrelevant documents cannot dominate the prompt.
5. **Test realistic abuse cases**: Include cross-tenant access, indirect prompt injection, poisoned uploads, and retrieval flooding in your evals.

RAG can make LLM applications much more useful, but it also turns data access into a security boundary. Test that boundary directly before you trust it in production.
