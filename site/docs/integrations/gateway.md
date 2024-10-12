# Gateway

The Gateway provides a unified interface for interacting with various AI Providers, allowing you to easily interact with chat and embedding models.

Gateway can handle concurrent requests with retries on failure, exponential backoff on all other errors, and rate limiting on model rate limits, request timeouts. Gateway also has an in-built LRU cache as well as allows user to specify their own cache. 

Gateway supports various providers such as OpenAI, Anthropic, Gemini, Groq, Azure, AWS Bedrock, etc. Gateway uses HTTP Requests to interact with the model providers. 

Gateway has unified input and output types for prompts and embedding inputs that work across providers. Gateway also allows for users to use provider specific inputs and convert them into Gateway's unified types. 

This is usage guide uses two independent packages -- `@adaline/gateway` and `@adaline/openai` to demonstrate Gateway. First we talk about the Provider package aka `@adaline/openai` that let's user perform provider specific logic and transformations. Then we talk about the actual Gateway package aka `@adaline/gateway` that let's user make actual Chat and Embedding calls.

# OpenAI Provider Usage Guide

## Installation

```bash
npm install @adaline/openai
```

## Initialization

```typescript
import { OpenAI } from "@adaline/openai";

const openai = new OpenAI();
```

## Chat and Embedding Models

### List available chat models

```typescript
const chatModels = openai.chatModelLiterals();
console.log(chatModels);
```

```output
[
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo-1106",
  "gpt-4-0125-preview",
  "gpt-4-0613",
  "gpt-4-1106-preview",
  "gpt-4-turbo-2024-04-09",
  "gpt-4-turbo-preview",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-4o-2024-08-06",
  "gpt-4o-mini",
  "gpt-4o",
  "o1-mini",
  "o1-preview"
]
```

### List available embedding models

```typescript
const embeddingModels = openai.embeddingModelLiterals();
console.log(embeddingModels);
```

```output
[
  "text-embedding-ada-002",
  "text-embedding-3-small",
  "text-embedding-3-large",
]
```

### Create a chat model instance

The model instance is used by Gateway to make API requests to the specified model according to the options provided.

```typescript
const chatModel = openai.chatModel({
  modelName: "gpt-4-turbo-preview",                         // required
  apiKey: "your-api-key-here",                              // required
  baseUrl: "https://your-custom-endpoint.com",              // optional
  organization: "your-openai-business-organization",        // optional
});
```
* You can specify a custom base URL for API requests. For eg. if the `baseUrl` specified is `https://your-custom-endpoint.com`, API requests for chat model will call `https://your-custom-endpoint.com/chat/completions`.
* You can specify a Business Organization to be included in API request headers.

### Create an embedding model instance

```typescript
const embeddingModel = openai.embeddingModel({
  modelName: "text-embedding-3-large",                      // required
  apiKey: "your-api-key-here",                              // required
  baseUrl: "https://your-custom-endpoint.com",              // optional
});
```
* You can specify a custom base URL for API requests. For eg. if the `baseUrl` specified is `https://your-custom-endpoint.com`, API requests for embedding model will call `https://your-custom-endpoint.com/embeddings`.

### Transform Model Request

`transformModelRequest()` method converts requests in OpenAI native format into Gateway's unified types. A User can either create their Gateway request in Gateway's unified types from scratch that will work across providers or they can convert their provider native request into Gateway's unified types using `transformModelRequest()` method and then invoke Gateway. 

```typescript
// OpenAI format
const openAiRequest = {
  // required fields
  messages: [
    { role: 'system', content: [{ type: 'text', text: 'Reply consisely and like a teacher' }] },
    { role: 'user', content: [{ type: 'text', text: 'What is 3 + 1?' }] },
    { role: 'assistant', content: [{ type: 'text', text: '3 + 1 = 4' }] },
    { role: 'user', content: [
        { type: 'image_url', image_url: { url: "some-url", detail: "high" } },
        { type: 'text', text: 'Solve the linear equation in the image' }
      ] 
    },
  ],
  // optional fields, all other Open AI fields
  max_tokens: 400,
  temperature: 0.95,
  logprobs: true,
  seed: 98322,
};

const chatModel = openai.chatModel({
  modelName: "gpt-4-turbo-preview",
  apiKey: "your-api-key-here",
});
const gatewayRequest = chatModel.transformModelRequest(openAiRequest)
```

```json
// Gateway's unified types
{
  "config": {
    "seed": 98322,
    "maxTokens": 400,
    "temperature": 0.95,
    "logProbs": true
  },
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "modality": "text",
          "value": "Reply consisely and like a teacher"
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "modality": "text",
          "value": "What is 3 + 1?"
        }
      ]
    },
    {
      "role": "assistant",
      "content": [
        {
          "modality": "text",
          "value": "3 + 1 = 4"
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "modality": "image",
          "detail": "high",
          "value": {
            "type": "url",
            "url": "some-url"
          }
        },
        {
          "modality": "text",
          "value": "Solve the linear equation in the image"
        }
      ]
    }
  ]
}
```


```typescript
// OpenAI format
const openAiRequest = {
  // required fields
  messages: [
    { role: "system", content: "you are a delivery date finding agent, you will be given an order id for this." },
    { role: "user", content: [{ type: "text", text: "What is the delivery date of order_id 'hg2345ds-lkj34' ?" }] },
  ],
  // optional fields
  max_tokens: 800,
  tool_choice: "required",
  tools: [
    {
        "type": "function",
        "function": {
            "name": "get_delivery_date",
            "description": "Get the delivery date for a customer's order. Call this whenever you need to know the delivery date, for example when a customer asks 'Where is my package'",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {
                        "type": "string",
                        "description": "The customer's order ID."
                    }
                },
                "required": ["order_id"],
                "additionalProperties": false
            }
        }
    }
  ]
};

const chatModel = openai.chatModel({
  modelName: "gpt-4-turbo-preview",
  apiKey: "your-api-key-here",
});
const gatewayRequest = chatModel.transformModelRequest(openAiRequest)
```

```json
// Gateway's unified types
{
  "config": {
    "toolChoice": "required",
    "maxTokens": 800
  },
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "modality": "text",
          "value": "you are a delivery date finding agent, you will be given an order id for this."
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "modality": "text",
          "value": "What is the delivery date of order_id 'hg2345ds-lkj34-435jnkl' ?"
        }
      ]
    }
  ],
  "tools": [
    {
      "type": "function",
      "definition": {
        "schema": {
          "name": "get_delivery_date",
          "description": "Get the delivery date for a customer's order. Call this whenever you need to know the delivery date, for example when a customer asks 'Where is my package'",
          "parameters": {
            "type": "object",
            "properties": {
              "order_id": {
                "type": "string",
                "description": "The customer's order ID."
              }
            },
            "required": [
              "order_id"
            ],
            "additionalProperties": false
          }
        }
      }
    }
  ]
}
```

```typescript
const openAiRequest = {
  // required fields
  input: [
    "some-text-for-embedding-1",
    "some-text-for-embedding-2",
  ],
  // optional fields
  encoding_format: "base64",
};

const embeddingModel = openai.embeddingModel({
  modelName: "text-embedding-3-large",
  apiKey: "your-api-key-here",
});
const gatewayRequest = embeddingModel.transformModelRequest(openAiRequest)
```

```json
// Gateway's unified types
{
  "config": {
    "encodingFormat": "base64"
  },
  "embeddingRequests": {
    "modality": "text",
    "requests": [
      "some-text-for-embedding-1",
      "some-text-for-embedding-2"
    ]
  }
}
```


# Gateway usage guide

## Installation

```bash
npm install @adaline/gateway
```

## Initialization

### Concurrency, Retry, Timeout

A single gateway instance can be used to concurrently run requests across provider and models

```typescript
import { Gateway } from "@adaline/gateway";

const gateway = new Gateway({
  // optional queue options
  queueOptions: {
    maxConcurrentTasks: 8,
    retryCount: 4,
    retry: {
      initialDelay: 5000,
      exponentialFactor: 2,
    },
    timeout: 120000, 
  },
});
```

`queueOptions` allows user to control how the Gateway processes requests. It includes the following properties: 
* `maxConcurrentTasks`: Specifies the maximum number of requests that can be processed concurrently.
* `retryCount`: Defines how many times a task should be retried if it fails for any status code.
* `retry`: Configures the retry behavior. If the failure status code is '429' aka model rate limit exceeded, Gateway will try to parse the response headers from the model and delay the next request until the rate limit has been reset. For all other status codes, Gateway uses a exponential backoff.
  * `initialDelay`: The delay in milliseconds before the first retry.
  * `exponentialFactor`: The factor by which the delay increases with each subsequent retry. Here, it's set to `2`, meaning the delay will double with each retry attempt. 
* `timeout`: Specifies the maximum time in milliseconds that the Gateway will wait for a request to complete before timing out.


### Caching

Gateway has an in-built LRU cache. Gateway's cache key is made up of 'model url', 'model name' and 'model request'.

```typescript
import { Gateway } from "@adaline/gateway";

// no cache provided, use internal LRU cache
const gateway = new Gateway({});
```

Gateway allow it's user to specify their own cache. Access for Gateway to read / write user's cache by implementing the `GatewayCache` interface.

```typescript
import type { Cache as GatewayCache } from '@adaline/gateway';

class GatewayCachePlugin<T> implements GatewayCache<T> {
    
    async get(key: string): Promise<T | undefined> {
      // your custom caching logic
      // use the given key and return the value found in cache for cache hit
      // or return undefined for cache miss
    }

    async set(key: string, value: T): Promise<void> {
      // your custom caching logic
      // use the given key and value to set in your cache
    }

    // Gateway will never invoke this method
    async delete(key: string): Promise<void> {
        throw new Error('Not implemented');
    }

    // Gateway will never invoke this method
    async clear(): Promise<void> {
        throw new Error('Not implemented');
    }
};

import { Gateway } from "@adaline/gateway";

const gateway = new Gateway({
  completeChatCache: new GatewayCachePlugin(),
  getEmbeddingsCache: new GatewayCachePlugin(),
});
```

## Complete Chat

```typescript
import { Gateway } from "@adaline/gateway";
import { OpenAI } from "@adaline/openai";

const gateway = new Gateway({});
const openai = new OpenAI();

const openAiRequest = {
  messages: [
    { role: "system", content: [{ type: "text", text: "Reply consisely and like a teacher" }] },
    { role: "user", content: [{ type: "text", text: "What is 3 + 1?" }] },
    { role: "assistant", content: [{ type: "text", text: "3 + 1 = 4" }] },
    { role: "user", content: [
        { type: "image_url", image_url: { url: "https://hs.sbcounty.gov/cn/Photo%20Gallery/_w/Sample%20Picture%20-%20Koala_jpg.jpg", detail: "high" } },
        { type: "text", text: "Solve the linear equation in the image" }
      ] 
    },
  ],
  max_tokens: 400,
  temperature: 0.95,
  seed: 98322,
};

const model = openai.chatModel({
  modelName: "gpt-4o",
  apiKey: "your-api-key-here",
});
const gatewayRequest = model.transformModelRequest(openAiRequest)

const request = {
  model: model,
  config: gatewayRequest.config,
  messages: gatewayRequest.messages,
};

async function testCompleteChat() {
  const response = await gateway.completeChat(request, {
    enableCache: false, // optional, default is true
  });
  // response.request is the request to model in Gateway's unified types
  // response.response is the response from the model in Gateway's unified types
  // response.cache is whether response was cache or not
  // response.latencyInMs is the gateway calculated latency 
  // response.provider.request is the actual HTTP request to model 
  // response.provider.response is the actual HTTP response from the model 
  console.log(JSON.stringify(response.response.provider.response, null, 2));
}

testCompleteChat();
```

```json
{
  "data": {
    "id": "chatcmpl-A8lFCRHkYLgfsVHENJPvtmzkzQO3D",
    "object": "chat.completion",
    "created": 1726651594,
    "model": "gpt-4o-2024-05-13",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "This image does not contain a linear equation. Instead, it shows a picture of a koala. If you have a linear equation you need help solving, please provide the equation in text form!",
          "refusal": null
        },
        "logprobs": null,
        "finish_reason": "stop"
      }
    ],
    "usage": {
      "prompt_tokens": 474,
      "completion_tokens": 39,
      "total_tokens": 513,
      "completion_tokens_details": {
        "reasoning_tokens": 0
      }
    },
    "system_fingerprint": "fp_8dd226ca9c"
  },
  "headers": {
    "date": "Wed, 18 Sep 2024 09:26:35 GMT",
    "content-type": "application/json",
    "transfer-encoding": "chunked",
    "connection": "close",
    "access-control-expose-headers": "X-Request-ID",
    "openai-organization": "your-openai-org",
    "openai-processing-ms": "2439",
    "openai-version": "2020-10-01",
    "strict-transport-security": "max-age=15552000; includeSubDomains; preload",
    "x-ratelimit-limit-requests": "10000",
    "x-ratelimit-limit-tokens": "30000000",
    "x-ratelimit-remaining-requests": "9999",
    "x-ratelimit-remaining-tokens": "29998807",
    "x-ratelimit-reset-requests": "6ms",
    "x-ratelimit-reset-tokens": "2ms",
    "x-request-id": "req_af1dcfbc6c5903fe30c48bf10352915a",
    "cf-cache-status": "DYNAMIC",
    "set-cookie": "__cf_bm=jlhCFfrsI0VF.S2pk7sWLnyE.UaTeIuJBhWbo8ThFEo-1726651595-1.0.1.1-QGpdXu7lKtesKkM2m80Y8WuvUXfMQ1TzHlHoGIoR0QvkLg78RjGtZTSdx0.1X0wRtCvCPLqrtXn_M1AlkVy1Uw; path=/; expires=Wed, 18-Sep-24 09:56:35 GMT; domain=.api.openai.com; HttpOnly; Secure; SameSite=None, _cfuvid=8mT4fgFaRnJIOm45VTYetdkyx3wLTXoIiWWnTqE3f2w-1726651595443-0.0.1.1-604800000; path=/; domain=.api.openai.com; HttpOnly; Secure; SameSite=None",
    "x-content-type-options": "nosniff",
    "server": "cloudflare",
    "cf-ray": "8c504b87cbe5ba36-SEA",
    "alt-svc": "h3=\":443\"; ma=86400"
  },
  "status": {
    "code": 200,
    "text": "OK"
  }
}
```

## Embeddings

```typescript
import { Gateway } from "@adaline/gateway";
import { OpenAI } from "@adaline/openai";

const gateway = new Gateway({});
const openai = new OpenAI();

const openAiRequest = {
  // required fields
  input: [
    "Hello world",
    "When the going gets tough, the tough get going. or something like that. or the tough pivots",
  ],
  // optional fields
  encoding_format: "base64",
};

const model = openai.embeddingModel({
  modelName: "text-embedding-3-large",
  apiKey: "your-api-key",
});
const gatewayRequest = model.transformModelRequest(openAiRequest)


const request = {
  model: model,
  config: gatewayRequest.config,
  embeddingRequests: gatewayRequest.embeddingRequests,
};

async function testGetEmbeddings() {
  const response = await gateway.getEmbeddings(request, {
    enableCache: false, // optional, default is true
  });
  // response.request is the request to model in Gateway's unified types
  // response.response is the response from the model in Gateway's unified types
  // response.cache is whether response was cache or not
  // response.latencyInMs is the gateway calculated latency 
  // response.provider.request is the actual HTTP request to model 
  // response.provider.response is the actual HTTP response from the model 
  console.log(JSON.stringify(response.response.provider.response, null, 2));
}

testGetEmbeddings();
```

```json
{
  "data": {
    "object": "list",
    "data": [
      {
        "object": "embedding",
        "index": 0,
        "embedding": "bDUPvNEuJ7xFZMs7sNcBPa+UB ... bO3xQqLveX9u6" // minified base64
      },
      {
        "object": "embedding",
        "index": 1,
        "embedding": "NxYFveE6CLyxc0q87bsrPVSZbj ... 9ULyA3wk8" //minified base64
      }
    ],
    "model": "text-embedding-3-large",
    "usage": {
      "prompt_tokens": 23,
      "total_tokens": 23
    }
  },
  "headers": {
    "date": "Wed, 18 Sep 2024 09:31:22 GMT",
    "content-type": "application/json",
    "transfer-encoding": "chunked",
    "connection": "close",
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "X-Request-ID",
    "openai-model": "text-embedding-3-large",
    "openai-organization": "your-openai-org",
    "openai-processing-ms": "62",
    "openai-version": "2020-10-01",
    "strict-transport-security": "max-age=15552000; includeSubDomains; preload",
    "x-ratelimit-limit-requests": "10000",
    "x-ratelimit-limit-tokens": "10000000",
    "x-ratelimit-remaining-requests": "9999",
    "x-ratelimit-remaining-tokens": "9999975",
    "x-ratelimit-reset-requests": "6ms",
    "x-ratelimit-reset-tokens": "0s",
    "x-request-id": "req_c7a4a9c39f1baa78312351ca6fc51e28",
    "cf-cache-status": "DYNAMIC",
    "set-cookie": "__cf_bm=n7eZtr5NGj98pC10N7e4G_1iFuMVNaPTxFEYMFaZVrU-1726651882-1.0.1.1-QHmeJ4SNNFXmDHse4z5PYDTEu.hwVaOzLiKAFPAZ7gVMfQgdC2KEP4J8ZzWAcr1NdC8ECTTzrJvx6ikc1LGQwg; path=/; expires=Wed, 18-Sep-24 10:01:22 GMT; domain=.api.openai.com; HttpOnly; Secure; SameSite=None, _cfuvid=kP_84ZnbpJOXVmsHCdamZXCbDX.cItrmt18thfqPyM0-1726651882995-0.0.1.1-604800000; path=/; domain=.api.openai.com; HttpOnly; Secure; SameSite=None",
    "x-content-type-options": "nosniff",
    "server": "cloudflare",
    "cf-ray": "8c505299dec975d3-SEA",
    "alt-svc": "h3=\":443\"; ma=86400"
  },
  "status": {
    "code": 200,
    "text": "OK"
  }
}
```

## Run concurrent requests

```typescript
import { Gateway, CompleteChatHandlerResponseType } from "@adaline/gateway";
import { OpenAI } from "@adaline/openai";

const gateway = new Gateway({
  queueOptions: {
    maxConcurrentTasks: 8,
    retryCount: 4,
    retry: {
      initialDelay: 5000,
      exponentialFactor: 2,
    },
    timeout: 120000, 
  },
});
const openai = new OpenAI();
const model = openai.chatModel({
  modelName: "gpt-4o",
  apiKey: "your-api-key",
});

const doCompleteChat = async (request): Promise<CompleteChatHandlerResponseType> => {
  return await gateway.completeChat({
    model: model,
    config: request.config,
    messages: request.messages,
    tools: request.tools,
  });
};

async function testConcurrentCompleteChat() {
  const requests = [] // your custom request generation logic

  const promises: Promise<CompleteChatHandlerResponseType>[] = [];

  requests.forEach(request => {
    promises.push(doCompleteChat(request));
  });

  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === "fulfilled") {
      console.log(JSON.stringify(result.value.response, null, 2));
    } else {
      console.log(result.reason);
    }
  }
}

testConcurrentCompleteChat();
```