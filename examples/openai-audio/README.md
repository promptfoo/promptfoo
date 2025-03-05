# OpenAI Audio Example

This example demonstrates how to use promptfoo to test OpenAI's audio capabilities with the GPT-4o model. The example covers:

1. Audio input to text output (speech-to-text)
2. Audio input to audio output (speech-to-speech)

## Prerequisites

- OpenAI API key with access to GPT-4o
- Sample audio file (replace `assets/audio-sample.wav` with your own file)

## Setup

1. Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=your-api-key-here
```

2. Place your audio sample in the `assets` directory. The example expects a file named `audio-sample.wav`.

## Files

- `promptfooconfig.yaml`: The main configuration file defining the providers, prompts, and tests
- `prompt.json`: A JSON template for OpenAI's Chat API with audio input
- `audio-assertions.js`: Custom JavaScript assertions for evaluating audio responses

## Running the Example

From the root directory of promptfoo, run:

```bash
npx promptfoo eval -c examples/openai-audio/promptfooconfig.yaml
```

## Understanding the Configuration

### Prompts

The example uses a single prompt template in `prompt.json` that can accept audio input and produce either text or audio output based on the specified `responseFormat` variable.

### Providers

Two provider configurations demonstrate different capabilities:

1. `openai-audio-to-text`: Processes audio input and returns text responses
2. `openai-audio-to-audio`: Processes audio input and returns audio responses

### Tests

The example includes two tests:

1. **Audio Input to Text Output**: Sends an audio file and expects a text response

   - Uses a custom assertion to check for expected keywords in the transcribed response

2. **Audio Input to Audio Output**: Sends an audio file and expects an audio response
   - Uses custom assertions to verify audio output presence and duration

## Custom Assertions

The `audio-assertions.js` file includes example assertion functions that can:

- Check if a response contains audio data
- Search for keywords in audio transcripts
- Validate audio duration

You can adapt these assertions for your specific testing needs.

## Notes

- This example uses GPT-4o (2024-05-14), which supports audio input and output
- Replace the sample audio file with your own recording for testing
- For production use, consider more robust audio analysis in your assertions
