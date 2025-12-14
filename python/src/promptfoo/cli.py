"""
CLI wrapper for the bundled promptfoo executable.

This module provides the entry point for the `promptfoo` command when installed via pip.
It executes the bundled standalone binary (SEA - Single Executable Application) which
includes the Node.js runtime, so no separate Node.js installation is required.
"""

import os
import stat
import subprocess
import sys
from pathlib import Path


def get_binary_name() -> str:
    """Get the platform-specific binary name."""
    if sys.platform == "win32":
        return "promptfoo.exe"
    return "promptfoo"


def find_binary() -> Path:
    """
    Find the bundled promptfoo binary.

    Returns:
        Path to the promptfoo executable.

    Raises:
        FileNotFoundError: If the binary is not found.
    """
    package_dir = Path(__file__).parent
    binary_name = get_binary_name()
    binary_path = package_dir / "_bin" / binary_name

    if not binary_path.exists():
        raise FileNotFoundError(
            f"promptfoo binary not found at {binary_path}.\n"
            "This may indicate a corrupted installation. Try reinstalling:\n"
            "  pip uninstall promptfoo && pip install promptfoo"
        )

    # Ensure the binary is executable (needed on Unix systems)
    if sys.platform != "win32":
        current_mode = binary_path.stat().st_mode
        if not (current_mode & stat.S_IXUSR):
            binary_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return binary_path


def main() -> int:
    """
    Main entry point for the promptfoo CLI.

    Executes the bundled promptfoo binary with all command-line arguments.

    Returns:
        Exit code from the promptfoo process.
    """
    try:
        binary_path = find_binary()
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # Build the command: promptfoo [args...]
    cmd = [str(binary_path)] + sys.argv[1:]

    # Set up environment
    env = os.environ.copy()

    # Indicate pip installation for telemetry
    env["PROMPTFOO_INSTALL_METHOD"] = "pip"

    # Execute the binary
    try:
        result = subprocess.run(cmd, env=env)
        return result.returncode
    except KeyboardInterrupt:
        return 130  # Standard exit code for SIGINT
    except Exception as e:
        print(f"Error executing promptfoo: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
