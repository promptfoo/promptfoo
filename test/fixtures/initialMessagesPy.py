def get_messages(context):
    vars = context.get('vars', {})
    user_name = vars.get('userName', 'Anonymous')
    return [
        {'role': 'user', 'content': f'Hello, my name is {user_name}'},
        {'role': 'assistant', 'content': 'Hi! How can I help you today?'},
    ]
