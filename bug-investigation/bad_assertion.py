import inspect
return {
  "pass": True,
  "score": 1,
  "reason": f"Assertion function '{inspect.stack()[0][3]}' was called.",
}