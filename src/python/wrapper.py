import asyncio
import importlib.util
import inspect
import json
import os
import sys

# Add the wrapper directory to sys.path so promptfoo_logger can be imported
wrapper_dir = os.path.dirname(os.path.abspath(__file__))
if wrapper_dir not in sys.path:
    sys.path.insert(0, wrapper_dir)

from promptfoo_logger import logger


def inject_logger_into_context(args):
    """Inject the logger into any dict arguments for hook access via context['logger']."""
    return [{**arg, "logger": logger} if isinstance(arg, dict) else arg for arg in args]


def strip_logger_from_result(result):
    """Remove non-serializable logger from result before JSON serialization."""
    if isinstance(result, dict):
        return {
            k: strip_logger_from_result(v) for k, v in result.items() if k != "logger"
        }
    elif isinstance(result, list):
        return [strip_logger_from_result(item) for item in result]
    return result


def call_method(script_path, method_name, *args):
    script_dir = os.path.dirname(os.path.abspath(script_path))
    module_name = os.path.basename(script_path).rsplit(".", 1)[0]
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    print(f"Importing module {module_name} from {script_dir} ...")

    spec = importlib.util.spec_from_file_location(module_name, script_path)
    script_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script_module)

    if "." in method_name:
        class_name, classmethod_name = method_name.split(".")
        method_to_call = getattr(getattr(script_module, class_name), classmethod_name)
    else:
        method_to_call = getattr(script_module, method_name)

    # Inject logger into context objects for hooks
    args_with_logger = inject_logger_into_context(list(args))

    if inspect.iscoroutinefunction(method_to_call):
        return asyncio.run(method_to_call(*args_with_logger))
    else:
        return method_to_call(*args_with_logger)


if __name__ == "__main__":
    script_path = sys.argv[1]
    method_name = sys.argv[2]
    json_path = sys.argv[3]
    output_path = sys.argv[4]
    with open(json_path, "r", encoding="utf-8") as fp:
        data = json.load(fp)

    result = call_method(script_path, method_name, *data)
    # Strip non-serializable logger from result before writing
    clean_result = strip_logger_from_result(result)
    with open(output_path, "w", encoding="utf-8") as fp:
        # Ensure Unicode is preserved by using ensure_ascii=False
        json.dump(
            {"type": "final_result", "data": clean_result}, fp, ensure_ascii=False
        )
