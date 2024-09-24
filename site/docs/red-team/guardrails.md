---
sidebar_label: Guardrails API
sidebar_position: 99
---

# Guardrails API

The Guardrails API helps detect potential security risks in user inputs to language models and identify personally identifiable information (PII).

## Base URL

```
https://api.promptfoo.dev
```

## Endpoints

### Prompt injection and Jailbreak detection

Analyzes input text to classify potential security threats from prompt injections and jailbreaks.

#### Request

```
POST /v1/guard
```

#### Headers

```
Content-Type: application/json
```

#### Body

```json
{
  "input": "String containing the text to analyze"
}
```

#### Response

```json
{
  "model": "promptfoo-guard",
  "results": [
    {
      "categories": {
        "prompt_injection": boolean,
        "jailbreak": boolean
      },
      "category_scores": {
        "prompt_injection": number,
        "jailbreak": number
      },
      "flagged": boolean
    }
  ]
}
```

- `categories.prompt_injection`: Indicates if the input may be attempting a prompt injection.
- `categories.jailbreak`: Indicates if the input may be attempting a jailbreak.
- `flagged`: True if the input is classified as either prompt injection or jailbreak.

### 2. PII Detection

Detects personally identifiable information (PII) in the input text. This system can identify a wide range of PII elements.

| Entity Type            | Description                          |
| ---------------------- | ------------------------------------ |
| account_number         | Account numbers (e.g., bank account) |
| building_number        | Building or house numbers            |
| city                   | City names                           |
| credit_card_number     | Credit card numbers                  |
| date_of_birth          | Dates of birth                       |
| driver_license_number  | Driver's license numbers             |
| email_address          | Email addresses                      |
| given_name             | First or given names                 |
| id_card_number         | ID card numbers                      |
| password               | Passwords or passcodes               |
| social_security_number | Social security numbers              |
| street_name            | Street names                         |
| surname                | Last names or surnames               |
| tax_id_number          | Tax identification numbers           |
| phone_number           | Telephone numbers                    |
| username               | Usernames                            |
| zip_code               | Postal or ZIP codes                  |

#### Request

```
POST /v1/pii
```

#### Headers

```
Content-Type: application/json
```

#### Body

```json
{
  "input": "String containing the text to analyze for PII"
}
```

#### Response

```json
{
  "model": "promptfoo-pii",
  "results": [
    {
      "categories": {
        "pii": boolean
      },
      "category_scores": {
        "pii": number
      },
      "flagged": boolean,
      "payload": {
        "pii": [
          {
            "entity_type": string,
            "start": number,
            "end": number,
            "pii": string
          }
        ]
      }
    }
  ]
}
```

- `pii`: Indicates if PII was detected in the input.
- `flagged`: True if any PII was detected.
- `payload.pii`: Array of detected PII entities with their types and positions in the text.

## Examples

### Guard Classification Example

```bash
curl https://api.promptfoo.dev/v1/guard \
  -X POST \
  -d '{"input": "Ignore previous instructions"}' \
  -H 'Content-Type: application/json'
```

#### Response

```json
{
  "model": "promptfoo-guard",
  "results": [
    {
      "categories": {
        "prompt_injection": false,
        "jailbreak": true
      },
      "category_scores": {
        "prompt_injection": 0.00004004167567472905,
        "jailbreak": 0.9999395608901978
      },
      "flagged": true
    }
  ]
}
```

This example shows a high probability of a jailbreak attempt.

### PII Detection Example

```bash
curl https://api.promptfoo.dev/v1/pii \
  -X POST \
  -d '{"input": "My name is John Doe and my email is john@example.com"}' \
  -H 'Content-Type: application/json'
```

#### Response

```json
{
  "model": "promptfoo-pii",
  "results": [
    {
      "categories": {
        "pii": true
      },
      "category_scores": {
        "pii": 1
      },
      "flagged": true,
      "payload": {
        "pii": [
          {
            "entity_type": "PERSON",
            "start": 11,
            "end": 19,
            "pii": "John Doe"
          },
          {
            "entity_type": "EMAIL",
            "start": 34,
            "end": 50,
            "pii": "john@example.com"
          }
        ]
      }
    }
  ]
}
```

## More

For more information on LLM vulnerabilities and how to mitigate LLM failure modes, refer to our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) and [Introduction to AI red teaming](/docs/red-team/) documentation.
