# WatsonX Documentation

## Introduction

Discover the potential of **IBM's WatsonX** in your applications with this provider! This provider seamlessly integrates state-of-the-art large language models (LLMs) into your project, empowering you with the powerful **Granite 13B Chat V2** and cutting-edge **Llama 3.2 Vision Instruct** models.

## Overview

The **WatsonX** provider bridges the gap between your applications, enabling you to harness the capabilities of their powerful LLMs. With **WatsonX**, you can effortlessly tackle a wide range of natural language processing (NLP) tasks, including:
- Chatbots and Conversational agents
- Content Generation
- Text Summarization
- Text Classification and Sentiment Analysis

### Supported Models

- **IBM Granite 13B Chat V2**: A versatile conversational model that excels in understanding and generating text across various domains.
- **Meta Llama 3.2 Vision Instruct**: A groundbreaking model that combines text and vision capabilities, enabling you to work with both text and images seamlessly.

## Setup Instructions

To start using the WatsonX provider, follow these steps:

### Prerequisites

Before integrating the WatsonX provider, ensure you have:
1. **IBM Cloud Account**: You need an IBM Cloud account to get API access to WatsonX models.
2. **API Keys and Project ID**: Retrieve your API key, project ID, and service URL from your IBM Cloud account.

### Installation

To install the WatsonX provider, use the following steps:

1. Install the necessary dependencies:

   ```bash
   npm install @ibm-cloud/watsonx-ai ibm-cloud-sdk-core
   ```

2. Set up the necessary environment variables:

   ```bash
   export WATSONX_API_KEY=your-ibm-cloud-api-key
   export WATSONX_PROJECT_ID=your-ibm-project-id
   ```

3. Alternatively, you can configure the API key and project ID directly in the configuration file.


## Usage Examples

### Basic Usage

Once configured, you can use the WatsonX provider to generate text responses based on prompts. Here’s an example of using the **Granite 13B Chat V2** model to answer a question:

```yaml
prompts:
  - "Answer the following question: '{{question}}'"

tests:
  - vars:
      question: "What is the capital of France?"
    assert:
      - type: contains
        value: "Paris"
```

### Example: Tweet Generation

You can use WatsonX to generate creative content, like tweets:

```yaml
prompts:
  - "Write a tweet about {{topic}}"
  - "Write a concise, funny tweet about {{topic}}"

tests:
  - vars:
      topic: bananas
  - vars:
      topic: avocado toast
    assert:
      - type: icontains
        value: avocado
```

### Example Code for Using WatsonX Provider

Here’s an example of using WatsonX models in JavaScript:

```js
import { WatsonXProvider } from './providers/watsonx';

const provider = new WatsonXProvider('ibm/granite-13b-chat-v2', {
  config: {
    apiKey: process.env.WATSONX_API_KEY,
    projectId: process.env.WATSONX_PROJECT_ID,
    serviceUrl: 'https://us-south.ml.cloud.ibm.com',
    maxNewTokens: 50,
  }
});

const prompt = 'What is the capital of France?';
const response = await provider.callApi(prompt);

console.log(response.output);  // Should return "Paris"
```

### Example Directory

You can add the above YAML files and examples to the `examples/` directory of your project for users to quickly try out different use cases.

## Comparison with Other Providers

### OpenAI vs. WatsonX

| **Feature**                   | **WatsonX**                                                                  | **OpenAI (GPT-4)**                               |
|-------------------------------|------------------------------------------------------------------------------|--------------------------------------------------|
| **Enterprise Security**        | Strong compliance (HIPAA, GDPR) and enterprise-grade security                | Security and compliance, but IBM’s reputation in regulated industries is a significant advantage |
| **Customization**              | High levels of customization for training and deployment                     | Customization is available but more general-purpose  |
| **Multimodal Capabilities**    | Llama 3.2 Vision Instruct offers text and vision tasks                       | GPT-4 is multimodal, combining text and vision    |
| **Cost Efficiency**            | Cost-effective for IBM Cloud users with potential for bundled services       | OpenAI has competitive pricing but no enterprise bundling with cloud services |
| **Support**                    | IBM provides dedicated enterprise support and consulting                     | OpenAI provides standard support, more self-service for enterprise needs |
| **IBM Ecosystem Integration**  | Seamless integration with other IBM services (Cloud, Watson Discovery, etc.) | OpenAI integrates with various platforms, but not specific to IBM's enterprise suite |

### Unique Features and Benefits of WatsonX

1. **Enterprise-Grade Security and Compliance**  
   Ideal for industries requiring compliance with standards like HIPAA and GDPR, WatsonX is tailored for high-security environments.
   
2. **Customization and Flexibility**  
   Fine-tune models to suit your specific data and business needs, giving you more precise control over model behavior.
   
3. **Multimodal Capabilities**  
   WatsonX supports both text and image inputs, expanding its utility for more complex tasks like image description generation.
   
4. **Cost Efficiency**  
   Bundled services for IBM Cloud users reduce costs, making WatsonX a cost-effective solution for enterprise-level AI tasks.
   
5. **Superior Customer Support**  
   IBM’s enterprise-focused support ensures smooth deployment, troubleshooting, and scaling of AI solutions.
   
6. **Seamless Integration with IBM Ecosystem**  
   WatsonX integrates well with other IBM services, providing a unified experience for enterprises already using the IBM ecosystem.