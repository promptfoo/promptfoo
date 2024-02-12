import json
import os
import sys
import importlib
import asyncio

def call_api(script_path, prompt, options, context):
    script_dir = os.path.dirname(os.path.abspath(script_path))
    module_name = os.path.basename(script_path).rsplit('.', 1)[0]
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    print(f'Importing module {module_name} from {script_dir}...')
    script_module = importlib.import_module(module_name)
    if asyncio.iscoroutinefunction(script_module.call_api):
        return asyncio.run(script_module.call_api(prompt, options, context))
    else:
        return script_module.call_api(prompt, options, context)

if __name__ == '__main__':
    script_path = sys.argv[1]
    prompt = sys.argv[2]
    options = json.loads(sys.argv[3])
    context = json.loads(sys.argv[4])

    result = call_api(script_path, prompt, options, context)
    print(json.dumps({
      'type': 'final_result',
      'data': result
    }))
