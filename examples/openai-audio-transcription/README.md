# openai-audio-transcription (OpenAI Audio Transcription Example)

You can run this example with:

```bash
npx promptfoo@latest init --example openai-audio-transcription
```

A simple example showing how to evaluate OpenAI's audio transcription models (Whisper and GPT-4o) with promptfoo.

## Quick Start

```bash
# Create this example
npx promptfoo@latest init --example openai-audio-transcription

# Set your API key
export OPENAI_API_KEY=your-key-here

# Add your audio files to test (see below)
# Then run the evaluation
promptfoo eval

# View the results
promptfoo view
```

## What's in this Example

- Tests multiple transcription models (Whisper, GPT-4o, GPT-4o Mini)
- Compares standard transcription vs. diarization (speaker identification)
- Configures language detection and custom prompts
- Tests with different audio file formats

## Audio Files

This example expects audio files in the example directory. You'll need to provide your own audio files for testing. Supported formats include:

- MP3
- MP4
- MPEG
- MPGA
- M4A
- WAV
- WEBM

Replace the file paths in `promptfooconfig.yaml` with your actual audio files.

## Key Features

### Standard Transcription Models

- `whisper-1`: OpenAI's original Whisper model
- `gpt-4o-transcribe`: GPT-4o optimized for transcription
- `gpt-4o-mini-transcribe`: Faster, more cost-effective option

### Diarization (Speaker Identification)

- `gpt-4o-transcribe-diarize`: Identifies different speakers in the audio
- Can specify number of speakers or provide speaker labels
- Output includes timestamps and speaker attribution

### Configuration Options

- `language`: Specify the language (e.g., 'en', 'es', 'fr')
- `prompt`: Provide context to improve transcription accuracy
- `temperature`: Control randomness (0-1)
- `timestamp_granularities`: Get word or segment-level timestamps

## Cost Information

Transcription models charge per minute of audio:

- `whisper-1`: $0.006/minute
- `gpt-4o-transcribe`: $0.006/minute
- `gpt-4o-mini-transcribe`: $0.003/minute
- `gpt-4o-transcribe-diarize`: $0.006/minute

## Documentation

- [OpenAI Audio API Documentation](https://platform.openai.com/docs/guides/audio)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
