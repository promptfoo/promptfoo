import json
import sys

def main():
    if len(sys.argv) >= 3:
        output = sys.argv[1]
        context = json.loads(sys.argv[2])
    else:
        raise ValueError("Model output and context are expected from promptfoo.")

    # Do whatever you want with `output` and `context` here.
    # ...

    return 'bananas' in output.lower()

# Any output from this script will interpreted as the result of the assertion.
print(main())