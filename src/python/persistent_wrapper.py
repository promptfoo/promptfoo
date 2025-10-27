#!/usr/bin/env python3
"""
Persistent Python wrapper for Promptfoo.

This wrapper loads a user script once and handles multiple requests
via a simple control protocol over stdin/stdout.

Protocol:
  - Node sends: "CALL:<function_name>:<request_file>:<response_file>\n"
  - Worker executes function, writes response to file
  - Worker sends: "DONE\n"
  - Node sends: "SHUTDOWN\n" to exit

Data transfer uses files (proven UTF-8 handling), control uses stdin/stdout.
"""

import asyncio
import importlib.util
import json
import os
import sys
import traceback


def load_user_module(script_path):
    """Load and return the user's Python module."""
    script_dir = os.path.dirname(os.path.abspath(script_path))
    module_name = os.path.basename(script_path).rsplit(".", 1)[0]

    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {script_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    return module


def get_callable(module, method_name):
    """Get the callable method from module, supporting 'Class.method' syntax."""
    if "." in method_name:
        class_name, classmethod_name = method_name.split(".", 1)
        cls = getattr(module, class_name)
        return getattr(cls, classmethod_name)
    else:
        return getattr(module, method_name)


def call_method(method_callable, args):
    """Call the method, handling both sync and async functions."""
    if asyncio.iscoroutinefunction(method_callable):
        return asyncio.run(method_callable(*args))
    else:
        return method_callable(*args)


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: persistent_wrapper.py <script_path> <function_name>",
            file=sys.stderr,
        )
        sys.exit(1)

    script_path = sys.argv[1]
    function_name = sys.argv[2]

    # Load user module once
    try:
        user_module = load_user_module(script_path)
        # Verify default function exists (for backward compatibility)
        default_callable = get_callable(user_module, function_name)
    except Exception as e:
        print(f"ERROR: Failed to load module: {e}", file=sys.stderr, flush=True)
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        sys.exit(1)

    # Signal ready
    print("READY", flush=True)

    # Main loop - wait for commands
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # stdin closed, exit gracefully
                break

            line = line.strip()

            if line.startswith("SHUTDOWN"):
                break
            elif line.startswith("CALL:"):
                handle_call(line, user_module, function_name)
            else:
                print(f"ERROR: Unknown command: {line}", file=sys.stderr, flush=True)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"ERROR in main loop: {e}", file=sys.stderr, flush=True)
            print(traceback.format_exc(), file=sys.stderr, flush=True)


def handle_call(command_line, user_module, default_function_name):
    """Handle a CALL command."""
    try:
        # Parse command: "CALL:<function_name>:<request_file>:<response_file>"
        # or legacy: "CALL:<request_file>:<response_file>"
        parts = command_line.split(":", 3)

        if len(parts) == 4:
            # New format: CALL:<function_name>:<request_file>:<response_file>
            _, function_name, request_file, response_file = parts
        elif len(parts) == 3:
            # Legacy format: CALL:<request_file>:<response_file>
            _, request_file, response_file = parts
            function_name = default_function_name
        else:
            raise ValueError(f"Invalid CALL command format: {command_line}")

        # Resolve the callable for this call
        method_callable = get_callable(user_module, function_name)

        # Read request
        with open(request_file, "r", encoding="utf-8") as f:
            args = json.load(f)

        # Execute user function
        try:
            result = call_method(method_callable, args)
            response = {"type": "result", "data": result}
        except Exception as e:
            response = {
                "type": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
            }

        # Write response
        with open(response_file, "w", encoding="utf-8") as f:
            json.dump(response, f, ensure_ascii=False)
            f.flush()  # Flush Python buffer
            os.fsync(f.fileno())  # Force OS to write to disk (critical for Windows)

        # Verify file is readable before signaling done (prevents race conditions)
        # Retry up to 3 times with small delays if file isn't immediately readable
        for verify_attempt in range(3):
            try:
                with open(response_file, "r", encoding="utf-8") as f:
                    _ = f.read()
                break  # Successfully read, exit retry loop
            except Exception as e:
                if verify_attempt < 2:
                    import time

                    time.sleep(0.1)  # 100ms delay before retry
                    continue
                # Final attempt failed
                print(
                    f"ERROR: Failed to verify response file after 3 attempts: {e}",
                    file=sys.stderr,
                    flush=True,
                )
                # Still send DONE to avoid hanging Node, but Node will handle missing file

        # Signal done
        print("DONE", flush=True)

    except Exception as e:
        print(f"ERROR handling call: {e}", file=sys.stderr, flush=True)
        print(traceback.format_exc(), file=sys.stderr, flush=True)
        # Still try to signal done to avoid hanging
        print("DONE", flush=True)


if __name__ == "__main__":
    main()
