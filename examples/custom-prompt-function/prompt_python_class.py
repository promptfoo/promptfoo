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
