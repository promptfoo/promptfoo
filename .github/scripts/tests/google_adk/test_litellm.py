"""Exercise the ADK example's optional adapter in its own CI environment."""

import importlib.util
import unittest

import test_cli


@unittest.skipUnless(
    importlib.util.find_spec("litellm"), "Optional LiteLLM adapter is not installed"
)
class GoogleAdkLiteLlmCliTest(test_cli.GoogleAdkCliTest):
    backend = "litellm"


if __name__ == "__main__":
    unittest.main()
