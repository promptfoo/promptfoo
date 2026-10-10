# openai-audio-transcription (OpenAI Audio Transcription Example)

Compare GPT Transcribe with Whisper and GPT-4o transcription models using the included Moon landing recording.

To copy the example into another project:

```bash
npx promptfoo@latest init --example openai-audio-transcription
```

If you run from the generated example directory, set `audio_file` to `sample-audio.mp3` before running `npx promptfoo eval`. The commands below assume the Promptfoo repository layout.

## Run the example

From the repository root:

```bash
export OPENAI_API_KEY=your-key-here
npm run local -- eval -c examples/openai-audio-transcription/promptfooconfig.yaml --no-cache -o transcription-results.json
```

Review the exported results for transcription text, assertion scores, detected languages, and cost when the API returns enough usage information.

## Audio Files

`sample-audio.mp3` contains Neil Armstrong's Moon landing quote. To test another recording, change `audio_file` and the assertions in `promptfooconfig.yaml`. File paths are relative to the directory where you run the command. Supported formats include MP3, MP4, MPEG, MPGA, M4A, WAV, and WebM.

## Key Features

### Standard Transcription Models

- `gpt-transcribe`: File transcription with language and keyword hints
- `whisper-1`: OpenAI's original Whisper model
- `gpt-4o-transcribe`: GPT-4o optimized for transcription
- `gpt-4o-mini-transcribe`: Faster, more cost-effective option

### Diarization (Speaker Identification)

- `gpt-4o-transcribe-diarize`: Identifies different speakers in the audio
- Supports automatic chunking and optional paired known-speaker references
- Output includes timestamps and speaker attribution

### Configuration Options

- `languages`: Expected input languages for GPT Transcribe, such as `[en, fr]`
- `keywords`: Literal terms for GPT Transcribe; each must be a non-empty line without `<` or `>`
- `language`: A single language hint for older models, such as `en`
- `prompt`: Provide context to improve transcription accuracy
- `temperature`: Control sampling randomness (0-1)
- `timestamp_granularities`: Get word or segment-level timestamps with Whisper
- `chunking_strategy`: Split long diarized audio (`auto` or `server_vad`)
- `known_speaker_names` and `known_speaker_references`: Pair up to four speaker names with 2-10 second audio data URLs

## Cost Information

Transcription models charge per minute of audio:

- `gpt-transcribe`: $0.0045/minute when duration is available
- `whisper-1`: $0.006/minute
- `gpt-4o-transcribe`: $0.006/minute
- `gpt-4o-mini-transcribe`: $0.003/minute
- `gpt-4o-transcribe-diarize`: $0.006/minute

## Documentation

- [OpenAI transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text)
- [promptfoo OpenAI Provider Documentation](https://promptfoo.dev/docs/providers/openai)
