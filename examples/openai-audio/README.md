# OpenAI Audio Example

This example demonstrates how to use promptfoo to test OpenAI's audio capabilities using audio-capable models. The example focuses on audio input processing (speech-to-text) and audio output generation (speech-to-speech).

## Quick Start

You can initialize this example in a new directory using:

```bash
npx promptfoo@latest init --example openai-audio
```

This will create all necessary files and folder structure to get started quickly.

## Setup

1. Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY=your-api-key-here
```

2. The example includes sample audio files in the `assets` directory:
   - `Armstrong_Small_Step.mp3` - Neil Armstrong's moon landing speech
   - `Kennedy_berliner.mp3` - JFK's "Ich bin ein Berliner" speech

## Files

- `promptfooconfig.yaml`: Configuration file defining the providers and tests
- `audio-input.json`: JSON template for the audio input prompt

## Running the Example

From the root directory of promptfoo, run:

```bash
npx promptfoo eval -c examples/openai-audio/promptfooconfig.yaml
```
