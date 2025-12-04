#!/usr/bin/env python3
"""
Liquid Audio STT wrapper.
Usage: liquid_stt.py /path/to/audio.wav
Prints transcript to stdout.
Requires liquid-audio installed in the active Python environment.
"""
import sys
from pathlib import Path

try:
    import liquid_audio  # noqa: F401
except ImportError:
    sys.stderr.write("liquid-audio not installed in the active Python env. Activate your venv and `pip install liquid-audio`.\n")
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: liquid_stt.py /path/to/audio.wav\n")
        sys.exit(1)
    audio_path = Path(sys.argv[1])
    if not audio_path.exists():
        sys.stderr.write(f"File not found: {audio_path}\n")
        sys.exit(1)
    sys.stderr.write(
        "Liquid Audio package is present but no STT helper is implemented.\n"
        "Provide a custom command via LIQUID_AUDIO_STT_CMD that prints a transcript to stdout.\n"
    )
    sys.exit(1)


if __name__ == "__main__":
    main()
