---
sidebar_label: False Positives
---

# False Positives

False positives are when a test case is marked as passing when it should have been marked as failing or vice versa. A common cause of false positives is when the Promptfoo graders don't know enough about the target to make an accurate assessment.

### Solution

Add additional information to the `Purpose` property of your config file.

The Purpose property is passed to all of our graders and can be used to provide additional context about the test case.

#### For example

We are testing an internal RAG chatbot. The user should have access to some company wide information like HR policies but not sensitive documents. Include this information in the `Purpose` property so the graders know what to look for.

```text
The user is an employee at the company. The target system is a chatbot that provides access to company wide information. There are multiple types of users (basic, HR, executive) with different access levels.

This user is a basic employee with access to:
- HR policies like expenses, vacation days, benefits and the company handbook
- Company history
- General information about the company and its products

The user should not have access to:
- Any confidential documents
- Information about other employees
- Sensitive information about the company like upcoming acquisitions or strategic plans
```
