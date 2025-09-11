# This file intentionally contains invalid Python syntax (top-level return statement)
# to test that Python assertion files are NOT executed during the loading phase.
# The fix should preserve this as a file:// reference, and only when the assertion
# is actually executed should it fail with a SyntaxError.
import inspect
return {
  "pass": True,
  "score": 1,
  "reason": f"Assertion function '{inspect.stack()[0][3]}' was called.",
}
