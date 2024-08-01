import subprocess
from typing import List, Set


def extract_unique_var_values(evals: List[dict], var_name: str) -> Set[str]:
    """Extracts unique values for a given variable from a list of evaluations.

    Args:
        evals: A list of evaluation dictionaries.
        var_name: The name of the variable to extract values for.

    Returns:
        A set of unique values for the specified variable.
    """
    # we use a set because when promptfoo is run with --repeat the tests will be duplicate
    # but we only want to run each setup/teardown command once
    values = set()
    for eval in evals:
        provider = eval["provider"]
        test = eval["test"]
        vars = test["vars"]
        description = test.get("description", "")

        val = vars.get(var_name, None)
        if val:
            values.add(val)

    return values


def evals_ran_hook(evals: List[dict], results, table, suite):
    """Runs teardown commands after evaluations are complete.

    Args:
        evals: A list of evaluation dictionaries.
        results: The evaluation results.
        table: The evaluation table.
        suite: The evaluation suite.
    """
    print(f"evals_ran suite: {suite}")
    teardown_commands = extract_unique_var_values(evals, "teardown")
    for command in teardown_commands:
        print(f"Running teardown command: {command}")
        subprocess.run(command, shell=True, check=True)


def evals_prepared_hook(evals: List[dict], suite: dict):
    """Runs setup commands before evaluations begin.

    Args:
        evals: A list of evaluation dictionaries.
        suite: The evaluation suite.
    """
    print(f"evals_prepared suite: {suite}")
    setup_commands = extract_unique_var_values(evals, "setup")
    for command in setup_commands:
        print(f"Running setup command: {command}")
        subprocess.run(command, shell=True, check=True)


def extension_hook(hook_name: str, context: dict):
    """Handles different extension hooks.

    Args:
        hook_name: The name of the hook being called.
        context: A dictionary containing context information for the hook.
    """
    if hook_name == "evals_prepared":
        evals_prepared_hook(context["evals"], context["suite"])
    if hook_name == "evals_ran":
        evals_ran_hook(
            context["evals"], context["results"], context["table"], context["suite"]
        )
