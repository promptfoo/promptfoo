import sys
import json

def generate_prompt(context):
    return f'Describe {context["vars"]["topic"]} concisely, comparing it to the Python programming language.'

if __name__ == '__main__':
    print(generate_prompt(json.loads(sys.argv[1])))
