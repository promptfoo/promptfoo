#!/usr/bin/env python3
"""
Enhanced persistent Python wrapper with tracing and async/sync support

Handles:
- Function signature inspection and adaptation
- Cross-platform NDJSON protocol with proper line ending handling
- Tracing context preservation and propagation
- Async/sync compatibility with event loop management
- Context serialization/deserialization
- Comprehensive error handling with trace preservation
"""

import asyncio
import importlib.util
import inspect
import json
import os
import sys
import traceback
from typing import Any, Callable, Dict, List


class PersistentPythonProvider:
    """Enhanced persistent provider with robust edge case handling"""

    def __init__(self):
        self.user_module = None
        self.user_instance = None
        self.user_state = {}
        self.event_loop = None
        self.user_output_buffer = {"stdout": [], "stderr": []}
        self._setup_event_loop()

    def _setup_event_loop(self):
        """Setup persistent event loop for async operations"""
        try:
            # Check if we're already in an event loop
            asyncio.get_running_loop()
            # We're in a running loop, use it
            self.event_loop = asyncio.get_running_loop()
        except RuntimeError:
            # No running loop, create our own
            self.event_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.event_loop)

    def _serialize_context(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Safely serialize context, preserving tracing info"""
        if not context:
            return {}

        serializable_context = {}

        # Preserve critical tracing fields
        tracing_fields = ["traceparent", "tracestate", "evaluationId", "testCaseId"]

        for field in tracing_fields:
            if field in context:
                serializable_context[field] = context[field]

        # Preserve other serializable fields
        safe_fields = ["vars", "debug", "bustCache"]
        for field in safe_fields:
            if field in context:
                try:
                    # Test if it's JSON serializable
                    json.dumps(context[field])
                    serializable_context[field] = context[field]
                except (TypeError, ValueError):
                    # Skip non-serializable fields
                    pass

        # Handle prompt object specially
        if "prompt" in context:
            prompt_obj = context["prompt"]
            if hasattr(prompt_obj, "raw") and hasattr(prompt_obj, "label"):
                serializable_context["prompt"] = {
                    "raw": prompt_obj.raw,
                    "label": prompt_obj.label,
                }
            else:
                serializable_context["prompt"] = str(prompt_obj)

        return serializable_context

    def _call_with_flexible_signature(
        self,
        method: Callable,
        args: List[Any],
        options: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Any:
        """Call method with function signature inspection and adaptation"""

        # Serialize context to ensure it's safe to pass
        safe_context = self._serialize_context(context)

        try:
            sig = inspect.signature(method)
            params = list(sig.parameters.keys())

            # Remove 'self' parameter for instance methods
            if params and params[0] == "self":
                params = params[1:]

            # Build arguments with tracing context
            standard_args = {
                "prompt": args[0] if args else "",
                "options": options,
                "context": safe_context,
                "state": self.user_state,
            }

            # Prepare call arguments
            call_args = []
            call_kwargs = {}

            # Check if function accepts **kwargs
            has_var_keyword = any(
                p.kind == p.VAR_KEYWORD for p in sig.parameters.values()
            )

            if has_var_keyword:
                # Function accepts **kwargs, pass everything
                call_kwargs = standard_args
            else:
                # Match parameters by name
                for param_name in params:
                    if param_name in standard_args:
                        call_args.append(standard_args[param_name])
                    elif len(call_args) < len(args):
                        call_args.append(args[len(call_args)])

            # Execute with proper async handling
            if asyncio.iscoroutinefunction(method):
                return self._run_async_method(
                    method, call_args, call_kwargs, safe_context
                )
            else:
                # Sync method - handle based on concurrency setting
                # DEADLOCK ISSUE DETAILS:
                # Previously, we used asyncio.get_event_loop().run_in_executor to call sync methods from async context.
                # However, this caused deadlocks when the event loop was already running (e.g., when called from within an async framework),
                # especially under "concurrency=async" settings or when nested event loops were present.
                # As a workaround, we now call the sync method directly, which blocks the event loop but avoids deadlocks.
                # PLAN FOR RESOLUTION:
                # - Investigate safe patterns for running sync code in async context, such as using a dedicated thread or process pool.
                # - Add tests to reproduce and detect deadlocks under various concurrency settings.
                # - Once a safe solution is found, re-enable run_in_executor or an equivalent mechanism.
                if call_kwargs:
                    result = method(**call_kwargs)
                else:
                    result = method(*call_args)

                # Ensure trace context is preserved in result
                return self._preserve_trace_in_result(result, safe_context)

        except TypeError as e:
            # Function signature mismatch
            sig = inspect.signature(method)
            return {
                "error": f"Function signature mismatch: {str(e)}",
                "expected_signature": str(sig),
                "received_args": len(args),
                "suggestion": "Check function parameters match expected signature",
                "traceparent": safe_context.get("traceparent"),
            }
        except Exception as e:
            # Preserve trace context in error
            return {
                "error": str(e),
                "traceback": traceback.format_exc(),
                "traceparent": safe_context.get("traceparent"),
                "evaluationId": safe_context.get("evaluationId"),
                "testCaseId": safe_context.get("testCaseId"),
            }

    def _run_async_method(
        self,
        method: Callable,
        args: List[Any],
        kwargs: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Any:
        """Run async method with proper event loop handling"""
        try:
            # Try to detect if we're already in an async context
            try:
                current_loop = asyncio.get_running_loop()
                if current_loop == self.event_loop:
                    # We're in our event loop, use run_until_complete
                    if kwargs:
                        task = method(**kwargs)
                    else:
                        task = method(*args)
                    return self.event_loop.run_until_complete(task)
                else:
                    # Different event loop, use ours
                    if kwargs:
                        task = method(**kwargs)
                    else:
                        task = method(*args)
                    return self.event_loop.run_until_complete(task)
            except RuntimeError:
                # No running loop, safe to use run_until_complete
                if kwargs:
                    task = method(**kwargs)
                else:
                    task = method(*args)
                return self.event_loop.run_until_complete(task)

        except Exception as e:
            # Preserve trace context in async errors
            return {
                "error": f"Async execution error: {str(e)}",
                "traceback": traceback.format_exc(),
                "traceparent": context.get("traceparent"),
                "async_error": True,
            }

    def _preserve_trace_in_result(self, result: Any, context: Dict[str, Any]) -> Any:
        """Ensure trace context is preserved in the result"""
        if not isinstance(result, dict):
            result = {"output": result}

        # Add trace metadata if not already present
        if "metadata" not in result:
            result["metadata"] = {}

        # Preserve tracing information
        trace_fields = ["traceparent", "evaluationId", "testCaseId"]
        for field in trace_fields:
            if field in context and field not in result["metadata"]:
                result["metadata"][field] = context[field]

        return result

    def initialize(self, script_path: str) -> Dict[str, Any]:
        """Initialize with comprehensive error handling and function discovery"""
        try:
            # Import user script
            script_dir = os.path.dirname(os.path.abspath(script_path))
            module_name = os.path.basename(script_path).rsplit(".", 1)[0]

            if script_dir not in sys.path:
                sys.path.insert(0, script_dir)

            spec = importlib.util.spec_from_file_location(module_name, script_path)
            if spec is None or spec.loader is None:
                return {"error": f"Cannot load module from {script_path}"}

            self.user_module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.user_module)

            # Discover available functions and classes with detailed info
            available_functions = []
            available_classes = []

            for name, obj in inspect.getmembers(self.user_module):
                if inspect.isfunction(obj) and not name.startswith("_"):
                    sig = inspect.signature(obj)
                    is_async = asyncio.iscoroutinefunction(obj)
                    available_functions.append(
                        {
                            "name": name,
                            "signature": str(sig),
                            "params": list(sig.parameters.keys()),
                            "is_async": is_async,
                            "supports_tracing": "context" in sig.parameters,
                        }
                    )
                elif inspect.isclass(obj) and not name.startswith("_"):
                    methods = []
                    for method_name, method_obj in inspect.getmembers(obj):
                        if inspect.isfunction(method_obj) or inspect.ismethod(
                            method_obj
                        ):
                            if not method_name.startswith("_"):
                                try:
                                    sig = inspect.signature(method_obj)
                                    is_async = asyncio.iscoroutinefunction(method_obj)
                                    methods.append(
                                        {
                                            "name": method_name,
                                            "signature": str(sig),
                                            "params": list(sig.parameters.keys()),
                                            "is_async": is_async,
                                            "supports_tracing": "context"
                                            in sig.parameters,
                                        }
                                    )
                                except (ValueError, TypeError):
                                    pass
                    available_classes.append({"name": name, "methods": methods})

            # Try to call init_provider if it exists
            init_result = {}
            if hasattr(self.user_module, "init_provider"):
                try:
                    init_result = self._call_with_flexible_signature(
                        self.user_module.init_provider, [], {}, {}
                    )
                except Exception as e:
                    return {"error": f"init_provider failed: {str(e)}"}

            return {
                "status": "ready",
                "available_functions": available_functions,
                "available_classes": available_classes,
                "init_result": init_result,
                "tracing_support": True,
                "async_support": True,
            }

        except SyntaxError as e:
            return {
                "error": f"Syntax error in {script_path}: {str(e)}",
                "line": e.lineno,
                "details": "Check for mixed tabs/spaces or missing commas/colons",
            }
        except IndentationError as e:
            return {
                "error": f"Indentation error in {script_path}: {str(e)}",
                "line": e.lineno,
                "details": "Mixed tabs and spaces detected",
            }
        except Exception as e:
            return {
                "error": f"Failed to initialize: {str(e)}",
                "traceback": traceback.format_exc(),
            }

    def call_method(
        self,
        method_name: str,
        args: List[Any],
        options: Dict[str, Any] = None,
        context: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """Call method with robust error handling and discovery"""
        if options is None:
            options = {}
        
        # Clear user output buffer before each call
        self.user_output_buffer = {"stdout": [], "stderr": []}
        if context is None:
            context = {}

        try:
            # Parse method name for class.method syntax
            if "." in method_name:
                class_name, actual_method_name = method_name.split(".", 1)

                if not hasattr(self.user_module, class_name):
                    return {"error": f"Class {class_name} not found in module"}

                user_class = getattr(self.user_module, class_name)

                if (
                    self.user_instance is None
                    or type(self.user_instance).__name__ != class_name
                ):
                    self.user_instance = user_class()

                if not hasattr(self.user_instance, actual_method_name):
                    return {
                        "error": f"Method {actual_method_name} not found in class {class_name}"
                    }

                method = getattr(self.user_instance, actual_method_name)
            else:
                # Module-level function
                if not hasattr(self.user_module, method_name):
                    # Try to find a default function
                    candidates = ["call_api", "main", "run"]
                    for candidate in candidates:
                        if hasattr(self.user_module, candidate):
                            method_name = candidate
                            break
                    else:
                        return {"error": f"Function {method_name} not found in module"}

                method = getattr(self.user_module, method_name)

            # Call with flexible signature and tracing support
            result = self._call_with_flexible_signature(method, args, options, context)

            # Ensure result is a dictionary
            if not isinstance(result, dict):
                result = {"output": result}

            # Add captured user output if any
            if self.user_output_buffer["stdout"] or self.user_output_buffer["stderr"]:
                if "metadata" not in result:
                    result["metadata"] = {}
                result["metadata"]["userOutput"] = {
                    "stdout": self.user_output_buffer["stdout"],
                    "stderr": self.user_output_buffer["stderr"]
                }

            return result

        except Exception as e:
            return {
                "error": str(e),
                "traceback": traceback.format_exc(),
                "method_name": method_name,
                "traceparent": context.get("traceparent") if context else None,
            }

    def handle_requests(self):
        """Robust NDJSON protocol with cross-platform support"""
        import sys

        # Set up proper text mode for cross-platform compatibility
        if hasattr(sys.stdin, "reconfigure"):
            sys.stdin.reconfigure(encoding="utf-8", newline=None)
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", newline=None)

        # Redirect user stdout/stderr to prevent pollution of NDJSON protocol
        original_stdout = sys.stdout
        original_stderr = sys.stderr

        # Create wrapper to capture user print statements
        class UserOutputCapture:
            def __init__(self, provider_instance, stream_type):
                self.provider = provider_instance
                self.stream_type = stream_type

            def write(self, text):
                if text.strip():  # Only buffer non-empty output
                    self.provider.user_output_buffer[self.stream_type].append(text.rstrip("\r\n"))

            def flush(self):
                pass

        # Redirect user stdout/stderr
        sys.stdout = UserOutputCapture(self, "stdout")
        sys.stderr = UserOutputCapture(self, "stderr")

        try:
            # Read line by line instead of chunks to avoid blocking
            for line in sys.stdin:
                line = line.rstrip("\r\n")  # Handle Windows \r\n and Unix \n

                if not line.strip():
                    continue

                try:
                    request = json.loads(line)
                    response = self.dispatch_request(request)
                except json.JSONDecodeError as e:
                    response = {
                        "id": None,
                        "error": f"Invalid JSON: {str(e)}",
                        "type": "protocol_error",
                        "received_line": line[:100] + "..."
                        if len(line) > 100
                        else line,
                    }
                except Exception as e:
                    response = {
                        "id": request.get("id") if "request" in locals() else None,
                        "error": str(e),
                        "type": "execution_error",
                        "traceback": traceback.format_exc(),
                    }

                # Send response as single JSON line
                try:
                    response_line = json.dumps(response, ensure_ascii=False)
                    original_stdout.write(response_line + "\n")
                    original_stdout.flush()
                except Exception as e:
                    error_response = {
                        "id": response.get("id"),
                        "error": f"Failed to serialize response: {str(e)}",
                        "type": "serialization_error",
                    }
                    original_stdout.write(json.dumps(error_response) + "\n")
                    original_stdout.flush()

        except KeyboardInterrupt:
            original_stdout.write(
                json.dumps({"type": "shutdown", "reason": "interrupted"}) + "\n"
            )
            original_stdout.flush()
        except Exception as e:
            original_stdout.write(
                json.dumps(
                    {
                        "type": "fatal_error",
                        "error": str(e),
                        "traceback": traceback.format_exc(),
                    }
                )
                + "\n"
            )
            original_stdout.flush()
        finally:
            # Cleanup event loop
            if self.event_loop and not self.event_loop.is_closed():
                try:
                    self.event_loop.close()
                except Exception:
                    pass

    def dispatch_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Dispatch incoming requests with comprehensive support"""
        req_id = request.get("id")
        req_type = request.get("type", "call")

        try:
            if req_type == "initialize":
                result = self.initialize(request["script_path"])
                return {"id": req_id, "type": "response", "result": result}

            elif req_type == "call":
                method_name = request["method"]
                args = request.get("args", [])
                options = request.get("options", {})
                context = request.get("context", {})

                result = self.call_method(method_name, args, options, context)
                return {"id": req_id, "type": "response", "result": result}

            elif req_type == "ping":
                return {"id": req_id, "type": "pong"}

            else:
                return {
                    "id": req_id,
                    "type": "error",
                    "error": f"Unknown request type: {req_type}",
                }

        except Exception as e:
            return {
                "id": req_id,
                "type": "error",
                "error": str(e),
                "traceback": traceback.format_exc(),
            }


if __name__ == "__main__":
    provider = PersistentPythonProvider()
    provider.handle_requests()
