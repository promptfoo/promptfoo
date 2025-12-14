"""
CLI wrapper for the bundled promptfoo Node.js application.

This module provides the entry point for the `promptfoo` command when installed via pip.
It executes the bundled Node.js CLI with all provided arguments.
"""

import os
import subprocess
import sys
from pathlib import Path


def find_node() -> str:
    """
    Find the Node.js executable.

    Returns the path to a Node.js executable, checking in order:
    1. Bundled Node.js in the package (future support for truly standalone wheels)
    2. System Node.js (node in PATH)

    Raises:
        FileNotFoundError: If no Node.js executable is found.
    """
    # Check for bundled Node.js first (for future standalone support)
    package_dir = Path(__file__).parent
    bundled_node = package_dir / "_bin" / "node"
    if bundled_node.exists():
        return str(bundled_node)

    # Check for bundled Node.js on Windows
    bundled_node_win = package_dir / "_bin" / "node.exe"
    if bundled_node_win.exists():
        return str(bundled_node_win)

    # Fall back to system Node.js
    node_cmd = "node.exe" if sys.platform == "win32" else "node"

    # Check if node is in PATH
    import shutil

    node_path = shutil.which(node_cmd)
    if node_path:
        return node_path

    raise FileNotFoundError(
        "Node.js is required but not found. Please install Node.js 20 or later:\n"
        "  - macOS: brew install node\n"
        "  - Ubuntu/Debian: apt install nodejs\n"
        "  - Windows: https://nodejs.org/\n"
        "  - Or use nvm: https://github.com/nvm-sh/nvm"
    )


def find_cli_script() -> Path:
    """
    Find the bundled promptfoo CLI script.

    Returns:
        Path to the promptfoo.mjs CLI script.

    Raises:
        FileNotFoundError: If the CLI script is not found.
    """
    package_dir = Path(__file__).parent
    cli_script = package_dir / "_bin" / "promptfoo.mjs"

    if not cli_script.exists():
        raise FileNotFoundError(
            f"promptfoo CLI script not found at {cli_script}.\n"
            "This may indicate a corrupted installation. Try reinstalling:\n"
            "  pip uninstall promptfoo && pip install promptfoo"
        )

    return cli_script


def main() -> int:
    """
    Main entry point for the promptfoo CLI.

    Executes the bundled Node.js CLI with all command-line arguments.

    Returns:
        Exit code from the Node.js process.
    """
    try:
        node_path = find_node()
        cli_script = find_cli_script()
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # Build the command: node promptfoo.mjs [args...]
    cmd = [node_path, str(cli_script)] + sys.argv[1:]

    # Set up environment for Node.js
    env = os.environ.copy()

    # Set NODE_PATH so Node.js can find native modules bundled with the package
    # The node_modules directory is located alongside the CLI script in _bin/
    package_dir = Path(__file__).parent
    bundled_node_modules = package_dir / "_bin" / "node_modules"
    if bundled_node_modules.exists():
        existing_node_path = env.get("NODE_PATH", "")
        if existing_node_path:
            env["NODE_PATH"] = f"{bundled_node_modules}{os.pathsep}{existing_node_path}"
        else:
            env["NODE_PATH"] = str(bundled_node_modules)

    # Indicate pip installation for telemetry
    env["PROMPTFOO_INSTALL_METHOD"] = "pip"

    # Execute Node.js with the CLI script
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
