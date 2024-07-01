from openai import OpenAI, AsyncOpenAI

client = OpenAI()
async_client = AsyncOpenAI()


def call_api(prompt, options, context):
    # Get config values
    some_option = options.get("config").get("someOption")

    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": "You are a marketer working for a startup called Bananamax.",
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        model="gpt-4o",
    )

    return {"output": chat_completion.choices[0].message.content}


async def custom_async_func(prompt, options, context):
    chat_completion = await async_client.chat.completions.create(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an AI assistant acting as a marketer for a startup called Bananamax. "
                    "Your task is to develop a marketing strategy and create a compelling "
                    "marketing message based on the provided information."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        model="gpt-3.5-turbo",
    )

    return {"output": chat_completion.choices[0].message.content}
