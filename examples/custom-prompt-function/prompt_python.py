import json
import sys


def prompt1(context):
    return (
        f"Write a one-sentence insult for anyone who likes {context['vars']['topic']}."
    )


def generate_prompt(context):
    return f"Describe {context['vars']['topic']} concisely, comparing it to the Python programming language."


class Prompt:
    system_prompt = "You're an angry pirate. Be concise and stay in character."
    user_prompt = "Tell me about {}"

    @staticmethod
    def prompt(context):
        return [
            {"role": "system", "content": Prompt.system_prompt},
            {
                "role": "user",
                "content": Prompt.user_prompt.format(context["vars"]["topic"]),
            },
        ]

    @staticmethod
    def prompt_with_cot(context):
        return [
            {"role": "system", "content": Prompt.system_prompt},
            {
                "role": "user",
                "content": Prompt.user_prompt.format(context["vars"]["topic"])
                + "\nLet's think step by step.",
            },
        ]


if __name__ == "__main__":
    print(generate_prompt(json.loads(sys.argv[1])))
