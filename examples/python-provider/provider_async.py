from openai import AsyncOpenAI

client = AsyncOpenAI()

async def call_api(prompt, options, context):
    chat_completion = await client.chat.completions.create(
            messages=[{
                'role': 'system',
                'content': 'You are a marketer working for a startup called Bananamax.',
            }, {
                'role': 'user',
                'content': prompt,
            }],
            model='gpt-3.5-turbo',
    )

    return {
        'output': chat_completion.choices[0].message.content
    }
