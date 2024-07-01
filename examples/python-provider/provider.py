from openai import OpenAI

client = OpenAI()

def call_api(prompt, options, context):
    # Get config values
    some_option = options.get('config').get('someOption')

    chat_completion = client.chat.completions.create(
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

def some_other_method(prompt, options, context):
    return call_api(prompt + '\n ALWAYS end with #yolo', options, context)
