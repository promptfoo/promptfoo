import subprocess
from typing import List, Set


def extract_unique_var_values(evals: List[dict], var_name: str) -> Set[str]:
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

def suite_start(suite: dict):
  print(f"Suite started: {suite}")

def suite_end(suite: dict):
  print(f"Suite ended: {suite}")

def evals_ran_hook(evals: List[dict], results, table):
  teardown_commands = extract_unique_var_values(evals, "teardown")
  for command in teardown_commands:
    print(f"Running teardown command: {command}")
    subprocess.run(command, shell=True, check=True)

def evals_prepared_hook(evals: List[dict]):
  setup_commands = extract_unique_var_values(evals, "setup")
  for command in setup_commands:
    print(f"Running setup command: {command}")
    subprocess.run(command, shell=True, check=True)


# Note: promptfoo swallows the output by default - run with LOG_LEVEL=debug if you need to see output
def extension_hook(hook_name, context):
  if hook_name == "suite_start":
    suite_start(context["suite"])
  if hook_name == "suite_end":
    suite_end(context["suite"])
  if hook_name == "evals_prepared":
    evals_prepared_hook(context["evals"])
  if hook_name == "evals_ran":
    evals_ran_hook(context["evals"], context["results"], context["table"])
