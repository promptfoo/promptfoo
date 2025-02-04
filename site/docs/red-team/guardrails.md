---
sidebar_label: Guardrails
sidebar_position: 99
---

# Guardrails

The Guardrails API helps detect potential security risks in user inputs to language models, identify personally identifiable information (PII), and assess potential harm in content.

The Guardrails API is focused on classification and detection. It returns a result, and your application can decide whether to warn, block, or otherwise respond to the input.

![LLM guardrails](/img/guardrails.png)

## API Base URL

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

### PII Detection

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

### Harm Detection

Analyzes input text to detect potential harmful content across various categories.

#### Request

```
POST /v1/harm
```

#### Headers

```
Content-Type: application/json
```

#### Body

```json
{
  "input": "String containing the text to analyze for potential harm"
}
```

#### Response

```json
{
  "model": "promptfoo-harm",
  "results": [
    {
      "categories": {
        "violent_crimes": boolean,
        "non_violent_crimes": boolean,
        "sex_related_crimes": boolean,
        "child_sexual_exploitation": boolean,
        "defamation": boolean,
        "specialized_advice": boolean,
        "privacy": boolean,
        "intellectual_property": boolean,
        "indiscriminate_weapons": boolean,
        "hate": boolean,
        "suicide_and_self_harm": boolean,
        "sexual_content": boolean,
        "elections": boolean,
        "code_interpreter_abuse": boolean
      },
      "category_scores": {
        "violent_crimes": number,
        "non_violent_crimes": number,
        "sex_related_crimes": number,
        "child_sexual_exploitation": number,
        "defamation": number,
        "specialized_advice": number,
        "privacy": number,
        "intellectual_property": number,
        "indiscriminate_weapons": number,
        "hate": number,
        "suicide_and_self_harm": number,
        "sexual_content": number,
        "elections": number,
        "code_interpreter_abuse": number
      },
      "flagged": boolean
    }
  ]
}
```

- Each category in `categories` indicates whether the input contains content related to that harm category.
- `category_scores` provides a numerical score (between 0 and 1) for each harm category.
- `flagged`: True if any harm category is detected in the input.

### Supported Categories

The harm detection API supports the following categories from ML Commons taxonomy:

| Category                  | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| violent_crimes            | Content related to violent criminal activities                |
| non_violent_crimes        | Content related to non-violent criminal activities            |
| sex_related_crimes        | Content related to sex crimes                                 |
| child_sexual_exploitation | Content involving the sexual exploitation of minors           |
| defamation                | Content that could be considered defamatory                   |
| specialized_advice        | Potentially harmful specialized advice (e.g., medical, legal) |
| privacy                   | Content that may violate privacy                              |
| intellectual_property     | Content that may infringe on intellectual property rights     |
| indiscriminate_weapons    | Content related to weapons of mass destruction                |
| hate                      | Hate speech or content promoting discrimination               |
| suicide_and_self_harm     | Content related to suicide or self-harm                       |
| sexual_content            | Explicit sexual content                                       |
| elections                 | Content that may interfere with elections                     |
| code_interpreter_abuse    | Potential abuse of code interpretation features               |

Each category is assigned a boolean value indicating its presence and a numerical score between 0 and 1 representing the confidence level of the detection.

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

### Harm Detection Example

```bash
curl https://api.promptfoo.dev/v1/harm \
  -X POST \
  -d '{"input": "How to make homemade explosives"}' \
  -H 'Content-Type: application/json'
```

#### Response

```json
{
  "model": "promptfoo-harm",
  "results": [
    {
      "categories": {
        "indiscriminate_weapons": true
      },
      "category_scores": {
        "indiscriminate_weapons": 1
      },
      "flagged": true
    }
  ]
}
```

This example shows the detection of potentially harmful content related to indiscriminate weapons.

## Guardrails UI

Promptfoo also provides a UI for guardrail observability for Cloud or Enterprise users.

The dashboard provides a summary of guardrail events.

![Guardrails UI](/img/guardrails.png)

The table view provides detailed information about each event.

![Guardrails event](/img/guardrails-table.png)

# More

For more information on LLM vulnerabilities and how to mitigate LLM failure modes, refer to our [Types of LLM Vulnerabilities](/docs/red-team/llm-vulnerability-types) and [Introduction to AI red teaming](/docs/red-team/) documentation.
