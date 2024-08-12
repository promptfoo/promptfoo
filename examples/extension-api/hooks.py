"""Extension hooks for promptfoo.

This module provides functionality for handling extension hooks in promptfoo.
It allows for executing custom actions before and after test suites and
individual evaluations, as well as running setup and teardown commands.

Example usage:
    extension_hook("beforeAll", context)
    extension_hook("beforeEach", context)
    extension_hook("afterEach", context)
    extension_hook("afterAll", context)

Typical usage example:

    from hooks import extension_hook

    context = {
        "evals": [...],
        "suite": {"name": "My Test Suite"},
    }
    extension_hook("beforeAll", context)
"""

import subprocess
from typing import Any, Dict, List, Set


def extract_unique_var_values(evals: List[Dict[str, Any]], var_name: str) -> Set[str]:
    """Extracts unique values for a given variable from a list of evaluations.

    Args:
        evals: A list of evaluation dictionaries.
        var_name: The name of the variable to extract values for.

    Returns:
        A set of unique values for the specified variable.
    """
    values = set()
    for eval in evals:
        test = eval.get("test", {})
        vars = test.get("vars", {})
        val = vars.get(var_name)
        if val:
            values.add(val)

    return values


def run_commands(commands: Set[str], action: str) -> None:
    """Runs a set of shell commands and handles errors.

    Args:
        commands: A set of shell commands to run.
        action: A string describing the action (e.g., "setup" or "teardown").

    Raises:
        subprocess.CalledProcessError: If a command fails to execute.
    """
    for command in commands:
        print(f"Running {action} command: {command}")
        try:
            subprocess.run(command, shell=True, check=True)
        except subprocess.CalledProcessError as e:
            print(f"Error running {action} command: {e}")


def extension_hook(hook_name: str, context: Dict[str, Any]) -> None:
    """Handles different extension hooks.

    This function processes various hook types and performs actions based on
    the hook name and provided context.

    Args:
        hook_name: The name of the hook being called (e.g., "beforeAll").
        context: A dictionary containing context information for the hook.

    Supported hook names:
        - beforeAll: Runs before all evaluations in a test suite.
        - afterAll: Runs after all evaluations in a test suite.
        - beforeEach: Runs before each individual evaluation.
        - afterEach: Runs after each individual evaluation.
    """
    if hook_name == "beforeAll":
        evals = context.get("evals", [])
        suite = context.get("suite", {})
        print(f"beforeAll: Starting test suite '{suite.get('name', 'Unnamed')}'")
        setup_commands = extract_unique_var_values(evals, "setup")
        run_commands(setup_commands, "setup")

    elif hook_name == "afterAll":
        evals = context.get("evals", [])
        results = context.get("results", [])
        print(f"afterAll: Completed {len(results)} evaluations")
        teardown_commands = extract_unique_var_values(evals, "teardown")
        run_commands(teardown_commands, "teardown")

    elif hook_name == "beforeEach":
        eval_data = context.get("eval", {})
        test = eval_data.get("test", {})
        print(
            f"beforeEach: Starting evaluation for '{test.get('description', 'Unnamed test')}'"
        )

    elif hook_name == "afterEach":
        eval_data = context.get("eval", {})
        result = context.get("result", {})
        test = eval_data.get("test", {})
        print(
            f"afterEach: Completed evaluation for '{test.get('description', 'Unnamed test')}'"
        )
        print(f"Result: {result.get('pass', False)}")

def get_transform(output, context):
    print(f"get_transform: {output}")
    print(f"context: {context}")
    return output
