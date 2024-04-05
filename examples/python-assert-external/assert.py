def get_assert(output, context):
    print('Prompt:', context['prompt'])
    print('Vars', context['vars']['topic'])

    return 'bananas' in output.lower()