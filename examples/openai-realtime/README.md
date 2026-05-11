# openai-realtime (OpenAI Realtime API Example)

This example demonstrates how to use promptfoo to test OpenAI's Realtime API capabilities. The Realtime API allows for real-time communication with `gpt-realtime-2`, `gpt-realtime-1.5`, and `gpt-realtime` using WebSockets, supporting text, audio, and model-dependent image inputs plus text/audio outputs.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example openai-realtime
cd openai-realtime
```

This will create all necessary files and folder structure to get started quickly.

## Setup

1. Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=your-api-key-here
```

2. Ensure you have access to the OpenAI Realtime API, which may require specific permissions from OpenAI.

### Custom endpoints and local development

You can point the Realtime provider at custom/proxy endpoints (including Azure-compatible gateways) or local/dev servers by setting `apiBaseUrl`. The provider automatically converts `https://` → `wss://` and `http://` → `ws://` for the WebSocket connection.

```yaml
providers:
  - id: openai:realtime:gpt-realtime-1.5
    config:
      # Custom hosted gateway
      apiBaseUrl: 'https://my-custom-api.com/v1' # connects to wss://my-custom-api.com/v1/realtime
      modalities: ['text']
```

For local development:

```yaml
providers:
  - id: openai:realtime:gpt-realtime-1.5
    config:
      apiBaseUrl: 'http://localhost:8080/v1' # connects to ws://localhost:8080/v1/realtime
      modalities: ['text']
```

You can also use environment variables like `OPENAI_API_BASE_URL` or `OPENAI_BASE_URL` instead of `apiBaseUrl`.

## Files

- `promptfooconfig.yaml`: Configuration file defining the providers and tests
- `promptfooconfig-gpt-realtime.yaml`: Comprehensive gpt-realtime-1.5 model demonstration with audio support
- `test-webui-audio.yaml`: Simple audio test for WebUI playback
- `realtime-input.json`: JSON template for the realtime input prompt
- `promptfooconfig-conversation.yaml`: Configuration for multi-turn conversation tests
- `realtime-conversation.js`: JavaScript prompt function for multi-turn conversations

## Multi-Turn Conversations

The Realtime API supports maintaining conversation history across multiple turns. This example includes a multi-turn conversation configuration that demonstrates how to:

1. **Maintain Conversation Context**: Keep track of previous exchanges
2. **Utilize Previous Responses**: Reference information from earlier in the conversation
3. **Create Independent Conversation Threads**: Run multiple separate conversations in parallel

To run the multi-turn conversation example:

```bash
npx promptfoo eval -c examples/openai-realtime/promptfooconfig-conversation.yaml
```

### How Multi-Turn Conversations Work

The multi-turn conversation example demonstrates how the OpenAI Realtime API can maintain context across multiple exchanges. This is implemented using promptfoo's built-in support for conversation history through the `_conversation` variable and metadata.

#### Key Components

1. **Special Variable**: The `_conversation` variable contains all previous turns in the conversation
2. **JavaScript Prompt Function**: The main approach uses a JavaScript function to properly format conversations
3. **Conversation IDs**: Each test with the same `conversationId` metadata value is part of the same conversation thread

When using `conversationId` in the metadata of tests, promptfoo automatically:

- Groups tests with the same ID into a conversation thread
- Makes previous exchanges available in each subsequent test
- Builds a complete conversation history the model can use for context

#### How Conversation State is Maintained

For each conversation turn:

1. The `_conversation` variable is automatically populated with all previous prompts and outputs
2. Messages are properly formatted for the Realtime API WebSocket protocol
3. The model responds with contextually relevant answers based on the conversation history

### Example Conversation Flow

```text
User: What are some popular tourist destinations in Japan?
AI: Some popular tourist destinations in Japan include Tokyo, Kyoto, Osaka, Hiroshima, and Hokkaido...

User: Which of those places is best to visit in autumn?
AI: Kyoto is particularly beautiful in autumn with its colorful maple leaves...

User: What traditional foods should I try there?
AI: In Kyoto during autumn, you should try momiji manju (maple leaf-shaped cakes), kyo-kaiseki (traditional multi-course meal)...
```

The API maintains context throughout this exchange, understanding that follow-up questions refer to Japan and then to the specific autumn locations.

### JavaScript Prompt Function

This example uses a JavaScript function (`realtime-conversation.js`) to properly format the conversation for the OpenAI Realtime API:

```javascript
module.exports = async function ({ vars, provider }) {
  // Create the messages array starting with system message
  const messages = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: vars.system_message || 'You are a helpful AI assistant.',
        },
      ],
    },
  ];

  // Add previous conversation turns if they exist
  if (vars._conversation && Array.isArray(vars._conversation)) {
    for (const completion of vars._conversation) {
      // Add user message
      messages.push({
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: completion.input,
          },
        ],
      });

      // Add assistant message
      messages.push({
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: completion.output,
          },
        ],
      });
    }
  }

  // Add the current question as the final user message
  messages.push({
    role: 'user',
    content: [
      {
        type: 'input_text',
        text: vars.question || '',
      },
    ],
  });

  return messages;
};
```

This approach provides better flexibility and error handling than using JSON templates with Nunjucks.

### Alternative: JSON Template with Nunjucks

We also provide a JSON template approach for reference:

```json
[
  {
    "role": "system",
    "content": [
      {
        "type": "input_text",
        "text": "{{ system_message }}"
      }
    ]
  }{% for completion in _conversation %},
  {
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "{{ completion.input }}"
      }
    ]
  },
  {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "{{ completion.output }}"
      }
    ]
  }{% endfor %},
  {
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "{{ question }}"
      }
    ]
  }
]
```

> **Note**: JSON validators may show errors for this template because of the Nunjucks expressions, but promptfoo will correctly process this file at runtime. This approach uses the `_conversation` variable to maintain conversation history in a way that works with the Realtime API.

### Conversation Threads

The configuration includes two separate conversation threads:

1. **Japan Travel Thread**: Questions about traveling in Japan, with follow-up questions
2. **Technology Thread**: Questions about real-time AI technology

Each thread maintains its own independent context while tests are evaluated.

## About the Realtime API Implementation

The provider implementation in promptfoo creates a direct WebSocket connection with the OpenAI Realtime API, following the official protocol:

1. **WebSocket Connection**: Establishes a secure WebSocket connection to `wss://api.openai.com/v1/realtime?model=MODEL_ID`
2. **Authentication**: Authenticates using the API key in the request headers
3. **Conversation Management**: Implements the full conversation protocol:
   - Creates user messages
   - Processes model responses
   - Handles text deltas in real-time
   - Processes function calls from the model
4. **Error Handling**: Implements robust error handling and timeout management

### Connection Details

The WebSocket connection follows the official OpenAI documentation:

```javascript
const wsUrl = `wss://api.openai.com/v1/realtime?model=${modelName}`;
const ws = new WebSocket(wsUrl, {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    // Other headers...
  },
});
```

### Message Format Requirements

When sending messages to the OpenAI Realtime API, you must use the correct content type format:

```javascript
// When sending user or system messages, use the 'input_text' content type
ws.send(
  JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text', // Must be 'input_text' for user/system inputs
          text: 'Your message here',
        },
      ],
    },
  }),
);

// When configuring modalities for response settings, use 'text' and 'audio'
const config = {
  modalities: ['text', 'audio'],
};
```

Structured Realtime prompts can also preserve the native multimodal user-content items documented by OpenAI:

```json
[
  {
    "role": "user",
    "content": [
      {
        "type": "input_text",
        "text": "Describe these inputs."
      },
      {
        "type": "input_audio",
        "audio": "<base64-encoded audio>"
      },
      {
        "type": "input_image",
        "image_url": "data:image/jpeg;base64,..."
      }
    ]
  }
]
```

Use `input_image` only with Realtime models that support image input, such as the current `gpt-realtime*` family.

Promptfoo keeps the existing `modalities` config key for compatibility, but sends the current GA Realtime wire shape to OpenAI under the hood.

### Function Calling Support

The provider supports the Realtime API's function calling capabilities:

1. **Tool Definition**: You can define tools (functions) in the configuration
2. **Function Arguments**: When the model decides to use a function, the implementation captures the arguments
3. **Function Result Handling**: Results from function calls are sent back to the model for further processing

Realtime function tools use the native OpenAI Realtime shape with top-level `name`, `description`, and `parameters` fields:

```yaml
providers:
  - id: openai:realtime:gpt-realtime-1.5
    config:
      tools:
        - type: function
          name: get_weather
          description: Get the current weather for a location
          parameters:
            type: object
            properties:
              location:
                type: string
            required: ['location']
      tool_choice: auto
```

If you reuse a Chat Completions-style tools file that wraps those fields under `function:`, promptfoo still accepts it as a compatibility input and normalizes only that legacy shape before sending it to the Realtime API.

When you provide a custom `functionCallHandler`, promptfoo forwards the model-emitted tool name and arguments to your handler. Validate the function name and parse or validate the arguments before side effects in your application code.

#### Implementing a Custom Function Handler

To use function calling in your application, you would implement a function call handler. Here's an example of how you might implement a weather function handler in JavaScript:

```javascript
// In your application code
const functionCallHandler = async (name, args) => {
  // Parse the function arguments
  const parsedArgs = JSON.parse(args);

  if (name === 'get_weather') {
    const { location } = parsedArgs;

    // In a real implementation, you would call a weather API here
    // This is just a mock example
    return JSON.stringify({
      location,
      temperature: '72°F',
      condition: 'Sunny',
      humidity: '45%',
      forecast: 'Clear skies for the next 24 hours',
    });
  }

  // Handle unknown function
  return JSON.stringify({ error: `Unknown function: ${name}` });
};

// You can then pass this handler in your prompt configuration
const config = {
  functionCallHandler,
};
```

## Audio Support

The Realtime API supports both text and audio interactions. promptfoo now includes full audio support:

### Supported Models and Features

- **gpt-realtime-2**: Reasoning-capable realtime model with text and audio support
- **gpt-realtime-1.5**: Flagship audio model for voice agents and customer support
- **gpt-realtime**: General-availability realtime model with text and audio support
  - Supports new voices: `cedar` and `marin` (in addition to existing voices)
  - Audio output is automatically converted from PCM16 to WAV format for browser playback
  - Use `promptfoo view` to access the WebUI and play generated audio files

### Audio Configuration

To enable audio support, configure your provider with:

```yaml
providers:
  - id: openai:realtime:gpt-realtime-1.5
    config:
      modalities: ['text', 'audio']
      voice: 'cedar' # or 'marin', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'
      instructions: 'Please respond with audio.'
```

### Audio Examples

- `test-webui-audio.yaml`: Simple audio test for WebUI playback
- `promptfooconfig-gpt-realtime.yaml`: Comprehensive gpt-realtime model demonstration

## Running the Example

From the root directory of promptfoo, run:

```bash
npx promptfoo eval -c examples/openai-realtime/promptfooconfig.yaml
```

## Troubleshooting WebSocket Connection Issues

If you encounter a "WebSocket error: Unexpected server response: 403" error, this typically indicates one of these issues:

1. **Network/Firewall Restrictions**: WebSocket connections may be blocked by your network or firewall.
   - Try running the example from a different network (e.g., mobile hotspot)
   - Check if your company network blocks WebSocket connections

2. **API Access**: Your OpenAI API key may not have access to the Realtime API.
   - Verify that your project has access to the Realtime API
   - Check your OpenAI dashboard for any access restrictions

3. **Rate Limits**: You may have hit rate limits or quotas for the Realtime API.
   - Check your OpenAI usage dashboard for any quota limitations

### Alternative API Usage

If you're unable to use the Realtime API due to WebSocket connection issues, you can still use the regular OpenAI chat API for most use cases. The configuration includes both providers, so you'll see results from the regular chat API even if the Realtime API fails to connect.
