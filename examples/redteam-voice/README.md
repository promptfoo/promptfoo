# Voice Redteam Example (OpenAI Realtime target)

This example runs the `voice` strategy against the OpenAI `gpt-realtime` model. The target uses realtime speech; the attacker plans each turn in text and then speaks via the configured speech provider (OpenAI TTS by default, or Liquid Audio locally).

## Files
- `redteam.voice.yaml` – Redteam config with the `voice` strategy and a minimal plugin set (`harmful:violent-crime`, `harmful:illegal-drugs`).

## Prerequisites
- `OPENAI_API_KEY` set in your environment.
- For faster local speech, optionally install Liquid Audio in a venv at the repo root:
  ```bash
  cd promptfoo
  python3.13 -m venv .venv
  . .venv/bin/activate
  pip install liquid-audio
  ```
  The Voice strategy will auto-use `.venv/bin/python` for the bundled Liquid TTS/STT scripts; set `speechProvider: local-liquid` in the config to use it.

## Run
```bash
cd examples/redteam-voice
promptfoo redteam run -c redteam.voice.yaml
```

Config notes:
- `speechProvider: openai` (default) uses OpenAI TTS/Whisper; set to `local-liquid` to use the bundled Liquid scripts. When `speechProvider` is `local-liquid` the attacker automatically uses TTS (no realtime OpenAI generation), so the voice output is deterministic and local.
- The bundled Liquid scripts expect a callable that turns text into wav bytes; if you have a custom Liquid CLI, set `LIQUID_AUDIO_TTS_CMD` (and `LIQUID_AUDIO_STT_CMD` for transcription) to point to it. If the Liquid command fails, the strategy will fall back to OpenAI TTS when possible, otherwise to silence.
- `turnCount` caps the attacker->target turns (default 6 in this example).
- The target prompt is reasserted each turn to keep the target persona active.
