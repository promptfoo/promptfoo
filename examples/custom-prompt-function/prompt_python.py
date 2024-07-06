import sys
import json


def prompt1(context):
    return (
        f'Write a one-sentence insult for anyone who likes {context["vars"]["topic"]}.'
    )


def generate_prompt(context):
    return f'Describe {context["vars"]["topic"]} concisely, comparing it to the Python programming language.'


if __name__ == "__main__":
    print(generate_prompt(json.loads(sys.argv[1])))
