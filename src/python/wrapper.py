import asyncio
import importlib.machinery
import importlib.util
import inspect
import json
import os
import sys


class UncachedSourceFileLoader(importlib.machinery.SourceFileLoader):
    """Loads mixed-case Python extensions without sharing a .py bytecode cache."""

    def get_code(self, fullname):
        source_path = self.get_filename(fullname)
        source = self.get_data(source_path)
        return self.source_to_code(source, source_path)


def normalize_module_path(script_path):
    root, extension = os.path.splitext(script_path)
    normalized_extension = extension.lower()
    if extension == normalized_extension or normalized_extension != ".py":
        return script_path

    normalized_path = f"{root}{normalized_extension}"
    try:
        os.lstat(script_path)
        return script_path
    except FileNotFoundError:
        try:
            os.lstat(normalized_path)
            return normalized_path
        except FileNotFoundError:
            return script_path


def call_method(script_path, method_name, *args):
    script_path = normalize_module_path(script_path)
    script_dir = os.path.dirname(os.path.abspath(script_path))
    module_name = os.path.basename(script_path).rsplit(".", 1)[0]
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)

    print(f"Importing module {module_name} from {script_dir} ...")

    extension = os.path.splitext(script_path)[1]
    if extension.lower() != ".py":
        raise ImportError(f"Cannot load non-Python source file {script_path}")
    loader_class = (
        importlib.machinery.SourceFileLoader
        if extension == ".py"
        else UncachedSourceFileLoader
    )
    loader = loader_class(module_name, script_path)
    spec = importlib.util.spec_from_file_location(
        module_name, script_path, loader=loader
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load module from {script_path}")
    script_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(script_module)

    if "." in method_name:
        class_name, classmethod_name = method_name.split(".")
        method_to_call = getattr(getattr(script_module, class_name), classmethod_name)
    else:
        method_to_call = getattr(script_module, method_name)
    if inspect.iscoroutinefunction(method_to_call):
        return asyncio.run(method_to_call(*args))
    else:
        return method_to_call(*args)


if __name__ == "__main__":
    script_path = sys.argv[1]
    method_name = sys.argv[2]
    json_path = sys.argv[3]
    output_path = sys.argv[4]
    with open(json_path, "r", encoding="utf-8") as fp:
        data = json.load(fp)

    result = call_method(script_path, method_name, *data)
    with open(output_path, "w", encoding="utf-8") as fp:
        # Ensure Unicode is preserved by using ensure_ascii=False
        json.dump({"type": "final_result", "data": result}, fp, ensure_ascii=False)
