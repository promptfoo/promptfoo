# openai-assistant (OpenAI Assistants API with Function Calling)

This example demonstrates how to use the OpenAI Assistants API with function calling capabilities in promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-assistant
```

## Overview

This example shows how to:

- Configure promptfoo to use the OpenAI Assistants API
- Define and use function tools with the Assistant
- Handle function calling and process results
- Test the Assistant's ability to understand when to call functions

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key

You can set this in a `.env` file or directly in your environment.

## Setup

1. Create an Assistant in the OpenAI platform with function calling capabilities
2. Replace the Assistant ID in the configuration file with your own Assistant ID
3. Run the evaluation to test function calling capabilities

### Creating an OpenAI Assistant

1. Go to the [OpenAI Platform](https://platform.openai.com/assistants)
2. Create a new assistant with GPT-4 or the latest model
3. Add a "Function" tool to the assistant
4. Copy the assistant ID (starts with "asst\_")

## Configuration

The example includes a `promptfooconfig.yaml` file that:

1. Sets up an OpenAI Assistant provider with the format `openai:assistant:YOUR_ASSISTANT_ID`
2. Defines a weather function tool that returns mock weather data
3. Includes test cases that prompt the assistant to get weather information for different locations

## Test Cases

The example includes test cases that:

1. Ask for the current weather in San Francisco
2. Request temperature information for New York in celsius
3. Ask about general weather conditions in Seattle

Each test case verifies that the assistant correctly:

- Recognizes when to call the function
- Passes the appropriate parameters
- Formats a helpful response based on the function output

## Output Explanation

When running the evaluation, you'll see:

- The function being called with the correct arguments
- The function's output (mock weather data)
- The assistant's response incorporating the weather information

## Customization

You can modify this example to:

- Add more sophisticated function tools
- Change the assistant's behavior with different instructions
- Test different prompt formulations and edge cases
- Implement real API calls instead of mock data
