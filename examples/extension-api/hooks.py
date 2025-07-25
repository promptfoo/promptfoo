"""Extension hooks for promptfoo.

This module provides functionality for handling extension hooks in promptfoo.
It allows for executing custom actions before and after test suites and
individual evaluations, as well as running setup and teardown commands.
"""

import logging
import os
from datetime import datetime
from typing import Optional

# Set up logging only if it hasn't been set up already
if not logging.getLogger().handlers:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    log_filename = f"promptfoo_run_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    log_path = os.path.join(current_dir, log_filename)
    logging.basicConfig(
        filename=log_path,
        level=logging.INFO,
        format="%(asctime)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

counter = 0


def extension_hook(hook_name: str, context: dict) -> Optional[dict]:
    """Handles different extension hooks for promptfoo.

    This function is called at various points during the test execution process.
    It logs information about the test suite and individual tests.

    Args:
        hook_name (str): The name of the hook being called. Can be one of
            "beforeAll", "beforeEach", "afterEach", or "afterAll".
        context (dict): A dictionary containing contextual information for the hook.
            The contents of this dictionary vary depending on the hook being called.

    Returns:
        context (Optional[dict]): The "beforeAll" and "beforeEach" hooks should return the context object,
            while the "afterAll" and "afterEach" hooks should not return anything.

    Global Variables:
        counter (int): Keeps track of the number of tests completed.

    Logs:
        Information about the test suite and individual tests, including setup,
        completion, results, and token usage.
    """
    global counter

    if hook_name == "beforeAll":
        suite = context.get("suite", {})
        logging.info(
            f"Setting up test suite: {suite.get('description') or 'Unnamed suite'}"
        )
        logging.info(f"Total prompts: {len(suite.get('prompts', []))}")
        logging.info(f"Total providers: {len(suite.get('providers', []))}")
        logging.info(f"Total tests: {len(suite.get('tests', []))}")

        # Add an additional test case to the suite:
        context["suite"]["tests"].append(
            {
                "vars": {
                    "body": "It's a beautiful day",
                    "language": "Spanish",
                },
                "assert": [{"type": "contains", "value": "Es un día hermoso."}],
            }
        )

        # Add an additional default assertion to the suite:
        context["suite"]["defaultTest"]["assert"].append({"type": "is-json"})

        return context

    elif hook_name == "beforeEach":
        logging.info("Preparing test")

        # All languages are now pirate:
        context["test"]["vars"]["language"] = (
            f"Pirate {context['test']['vars']['language']}"
        )

        return context

    elif hook_name == "afterEach":
        result = context.get("result", {})
        result_str = ""
        if result:
            success = "Pass" if result.get("success") else "Fail"
            score = result.get("score", 0)
            result_str = f", Result: {success}, Score: {score}"
        logging.info(f"Completed test {counter}{result_str}")

        # Access sessionId if available (from multi-turn conversations or stateful tests)
        session_id = result.get("metadata", {}).get("sessionId")
        if session_id:
            logging.info(f"Session ID: {session_id}")

        session_ids = result.get("metadata", {}).get("sessionIds")
        if session_ids:
            logging.info(f"Session IDs: {session_ids}")

        counter += 1

    elif hook_name == "afterAll":
        results = context.get("results", [])
        logging.info("Test suite completed")
        logging.info(f"Total tests run: {len(results)}")

        successes = sum(1 for r in results if r.get("success"))
        failures = sum(1 for r in results if not r.get("success"))
        logging.info(f"Successes: {successes}")
        logging.info(f"Failures: {failures}")

        total_token_usage = sum(
            r.get("response", {}).get("tokenUsage", {}).get("total", 0) for r in results
        )
        logging.info(f"Total token usage: {total_token_usage}")

    logging.info("")  # Add a blank line for readability between hooks
