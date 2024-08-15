import asyncio
import importlib.util
import json
import os
import sys


def call_method(script_path, method_name, *args):
    script_dir = os.path.dirname(os.path.abspath(script_path))
    module_name = os.path.basename(script_path).rsplit(".", 1)[0]
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    print(f"Importing module {module_name} from {script_dir} ...")

    spec = importlib.util.spec_from_file_location(module_name, script_path)
    script_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script_module)

    method_to_call = getattr(script_module, method_name)
    if asyncio.iscoroutinefunction(method_to_call):
        return asyncio.run(method_to_call(*args))
    else:
        return method_to_call(*args)


if __name__ == "__main__":
    script_path = sys.argv[1]
    method_name = sys.argv[2]
    json_path = sys.argv[3]
    output_path = sys.argv[4]
    with open(json_path, "r") as fp:
        data = json.load(fp)

    result = call_method(script_path, method_name, *data)
    with open(output_path, "w") as fp:
        fp.write(json.dumps({"type": "final_result", "data": result}))
