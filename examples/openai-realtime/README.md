# openai-realtime (OpenAI Realtime API Example)

This example demonstrates how to use promptfoo to test OpenAI's Realtime API capabilities. The Realtime API allows for real-time communication with GPT-4o class models using WebSockets, supporting both text and audio inputs/outputs.

## Quick Start

You can run this example with:

```bash
npx promptfoo@latest init --example openai-realtime
```

This will create all necessary files and folder structure to get started quickly.

## Setup

1. Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=your-api-key-here
```

2. Ensure you have access to the OpenAI Realtime API (Beta), which may require specific permissions from OpenAI.

## Files

- `promptfooconfig.yaml`: Configuration file defining the providers and tests
- `realtime-input.json`: JSON template for the realtime input prompt

## About the Realtime API Implementation

The provider implementation in promptfoo creates a direct WebSocket connection with the OpenAI Realtime API, following the official protocol:

1. **WebSocket Connection**: Establishes a secure WebSocket connection to `wss://api.openai.com/v1/realtime?model=MODEL_ID`
2. **Authentication**: Authenticates using the API key in the request headers, including the required beta header
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
    'OpenAI-Beta': 'realtime=v1',
    // Other headers...
  },
});
```

### Message Format Requirements

When sending messages to the OpenAI Realtime API, you must use the correct content type format:

```javascript
// When sending user messages, use the 'text' content type
// (NOT 'input_text' which might be suggested by some error messages)
ws.send(
  JSON.stringify({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'text', // Must be 'text', not 'input_text'
          text: 'Your message here',
        },
      ],
    },
  }),
);

// When configuring modalities, use 'text' and 'audio'
// (NOT 'input_text' or 'output_text')
const config = {
  modalities: ['text', 'audio'],
};
```

**Important Note**: The OpenAI Realtime API is in beta and the format requirements may change. The implementation in promptfoo follows the current requirements as of the latest API version.

### Function Calling Support

The implementation supports the Realtime API's function calling capabilities:

1. **Tool Definition**: You can define tools (functions) in the configuration
2. **Function Arguments**: When the model decides to use a function, the implementation captures the arguments
3. **Function Result Handling**: Results from function calls are sent back to the model for further processing

In this example, we've configured a simple weather function to demonstrate the capability. In a real implementation, you would connect this to actual weather data.

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

While the Realtime API supports audio input and output, the current implementation focuses on text interactions for simplicity. Future enhancements could include support for:

- Audio input processing
- Receiving and handling audio output
- Turn detection and interruption capabilities

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

2. **API Access**: Your OpenAI API key may not have access to the Realtime API beta.

   - Verify that you have been granted access to the Realtime API beta
   - Check your OpenAI dashboard for any access restrictions

3. **Rate Limits**: You may have hit rate limits or quotas for the Realtime API.
   - Check your OpenAI usage dashboard for any quota limitations

### Alternative API Usage

If you're unable to use the Realtime API due to WebSocket connection issues, you can still use the regular OpenAI chat API for most use cases. The configuration includes both providers, so you'll see results from the regular chat API even if the Realtime API fails to connect.
