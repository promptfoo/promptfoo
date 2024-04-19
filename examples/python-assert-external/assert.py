def get_assert(output, context):
    print('Prompt:', context['prompt'])
    print('Vars', context['vars']['topic'])

    # You can return a bool...
    # return 'bananas' in output.lower()

    # A score (where 0 = Fail)...
    # return 0.5

    # Or an entire grading result...
    return {
        'pass': 'bananas' in output.lower(),
        'score': 0.5,
        'reason': 'Contains banana',
    }