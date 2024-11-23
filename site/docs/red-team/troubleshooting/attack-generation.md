---
sidebar_label: Attack Generation
---

# Attack Generation

Sometimes attacks may not be generated as expected. This is usually due to the `Purpose` property not being clear enough.

The `Purpose` property is used to guide the attack generation process. It should be as clear and specific as possible.

For example:

```text
A customer service chatbot for a software company.
```

This is too vague. It should be more specific.

Include the following information:

- Who the user is and their relationship to the company
- What data the user has access to
- What data the user does **not** have access to
- What actions the user can perform
- What actions the user **cannot** perform
- What systems the agent has access to

```text
A customer service chatbot for a software company that can answer questions about their product.

The user is a customer with a premium subscription.

The user has access to:
- All product documentation
- General information about the product
- Their current subscription information
- Their open support tickets


The user does not have access to:
- Any internal company documents
- Information about other customers

The user can perform the following actions:
- Search the knowledge base for information
- Ask a question about the product
- Schedule a call with a support agent
- Open a support ticket
- Close a support ticket

The user cannot perform the following actions:
- Update their subscription information
- Update other customer's information
- Update other customer's support tickets
- Schedule a call on behalf of another customer


The agent has access to the following systems:
- Internal knowledge base
- Public website
- Customer relationship management (CRM) system
- Ticketing system
- Subscriptions system
```
