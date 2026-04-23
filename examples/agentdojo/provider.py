"""
AgentDojo Promptfoo Provider

Runs AgentDojo benchmark tasks through Promptfoo's evaluation framework.
This provider wraps AgentDojo's benchmark API to test LLM agents against
prompt injection attacks.

Usage in promptfooconfig.yaml:
    providers:
      - id: file://provider.py
        config:
          model: gpt-4o
          defense: null
          attack: important_instructions
          version: v1.2.2
"""

import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from contextlib import nullcontext
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_MAX_OUTPUT_TOKENS = 4096
DEFAULT_REQUEST_TIMEOUT = 120

# Cache for expensive objects
_pipeline_cache: dict[str, Any] = {}
_suite_cache: dict[str, Any] = {}
_attack_cache: dict[str, Any] = {}

_TRACEPARENT_RE = re.compile(
    r"^00-(?P<trace_id>[0-9a-f]{32})-(?P<parent_span_id>[0-9a-f]{16})-(?P<trace_flags>[0-9a-f]{2})$"
)

# Token usage accumulator - reset per task execution
# Format: {"prompt": int, "completion": int, "total": int}
_token_usage: dict[str, int] = {"prompt": 0, "completion": 0, "total": 0}


def _reset_token_usage():
    """Reset token accumulator before a new task execution."""
    global _token_usage
    _token_usage = {"prompt": 0, "completion": 0, "total": 0}


def _accumulate_tokens(usage):
    """Accumulate token counts from an OpenAI response usage object.

    Handles both Chat Completions API (prompt_tokens, completion_tokens) and
    Responses API (input_tokens, output_tokens) formats.
    """
    global _token_usage
    if usage:
        # Chat Completions API format
        prompt = getattr(usage, "prompt_tokens", 0) or 0
        completion = getattr(usage, "completion_tokens", 0) or 0
        # Responses API format
        if not prompt:
            prompt = getattr(usage, "input_tokens", 0) or 0
        if not completion:
            completion = getattr(usage, "output_tokens", 0) or 0

        _token_usage["prompt"] += prompt
        _token_usage["completion"] += completion
        _token_usage["total"] += getattr(usage, "total_tokens", 0) or 0


def _agentdojo_model_alias(model: str) -> str:
    """Map custom model names to an AgentDojo-recognized name for attack prompts."""
    model_lower = model.lower()
    if "gpt-4" in model_lower or "gpt-5" in model_lower:
        return "gpt-4o-2024-05-13"
    if "gpt-3" in model_lower:
        return "gpt-3.5-turbo-0125"
    if "claude" in model_lower:
        return "claude-3-5-sonnet-20241022"
    if "gemini" in model_lower:
        return "gemini-2.0-flash-001"
    if "command" in model_lower or "cohere" in model_lower:
        return "command-r-plus"
    if "llama" in model_lower or "mixtral" in model_lower:
        return "meta-llama/Llama-3-70b-chat-hf"
    return "meta-llama/Llama-3-70b-chat-hf"


def _slugify(value: str) -> str:
    """Create a filesystem-safe slug for per-run AgentDojo trace directories."""
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_")
    return slug or "default"


def _run_logdir(
    base_logdir: Path, model: str, defense: str | None, attack_name: str
) -> Path:
    """Separate AgentDojo traces by model, defense, and attack to avoid stale reuse."""
    slug = _slugify(f"{model}__defense-{defense or 'none'}__attack-{attack_name}")
    return base_logdir / slug


def _is_registered_agentdojo_model(model: str) -> bool:
    from agentdojo.agent_pipeline.agent_pipeline import ModelsEnum

    try:
        ModelsEnum(model)
        return True
    except ValueError:
        return False


def _otel_endpoint(config: dict) -> str:
    endpoint = (
        config.get("otel_endpoint")
        or os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
        or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or "http://localhost:4318"
    )
    endpoint = endpoint.rstrip("/")
    if endpoint.endswith("/v1/traces"):
        return endpoint
    return f"{endpoint}/v1/traces"


def _span_attributes(attributes: dict[str, Any]) -> dict[str, Any]:
    """Drop None values because OTEL attributes cannot be null."""
    return {key: value for key, value in attributes.items() if value is not None}


def _otlp_value(value: Any) -> dict[str, Any]:
    if isinstance(value, bool):
        return {"boolValue": value}
    if isinstance(value, int):
        return {"intValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, (list, tuple)):
        return {"arrayValue": {"values": [_otlp_value(item) for item in value]}}
    if isinstance(value, dict):
        return {"stringValue": json.dumps(value, default=str)}
    return {"stringValue": str(value)}


def _otlp_attributes(attributes: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"key": key, "value": _otlp_value(value)}
        for key, value in _span_attributes(attributes).items()
    ]


class OtlpJsonSpan:
    """Tiny OTLP/JSON span exporter for Promptfoo's in-process receiver."""

    def __init__(
        self,
        endpoint: str,
        traceparent: str,
        name: str,
        attributes: dict[str, Any],
    ):
        match = _TRACEPARENT_RE.match(traceparent)
        if match is None:
            raise ValueError(f"Invalid traceparent: {traceparent}")
        self.endpoint = endpoint
        self.trace_id = match.group("trace_id")
        self.parent_span_id = match.group("parent_span_id")
        self.span_id = os.urandom(8).hex()
        self.name = name
        self.attributes = _span_attributes(attributes)
        self.start_time_ns = 0
        self.end_time_ns = 0
        self.status = {"code": 1}

    def __enter__(self):
        self.start_time_ns = time.time_ns()
        return self

    def __exit__(self, exc_type, exc, traceback):
        if exc is not None:
            self.record_exception(exc)
        self.end_time_ns = time.time_ns()
        self._export()
        return False

    def set_attribute(self, key: str, value: Any):
        if value is not None:
            self.attributes[key] = value

    def record_exception(self, error: Exception):
        self.status = {"code": 2, "message": str(error)}
        self.set_attribute("exception.type", type(error).__name__)
        self.set_attribute("exception.message", str(error))

    def _export(self):
        service_name = os.getenv("OTEL_SERVICE_NAME", "promptfoo-agentdojo-provider")
        payload = {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": _otlp_attributes(
                            {
                                "service.name": service_name,
                                "service.version": "1.0.0",
                            }
                        )
                    },
                    "scopeSpans": [
                        {
                            "scope": {
                                "name": "promptfoo.agentdojo.provider",
                                "version": "1.0.0",
                            },
                            "spans": [
                                {
                                    "traceId": self.trace_id,
                                    "spanId": self.span_id,
                                    "parentSpanId": self.parent_span_id,
                                    "name": self.name,
                                    "kind": 1,
                                    "startTimeUnixNano": str(self.start_time_ns),
                                    "endTimeUnixNano": str(self.end_time_ns),
                                    "attributes": _otlp_attributes(self.attributes),
                                    "status": self.status,
                                }
                            ],
                        }
                    ],
                }
            ]
        }
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        timeout = float(os.getenv("OTEL_EXPORTER_OTLP_TIMEOUT", "5"))
        try:
            with urllib.request.urlopen(request, timeout=timeout):
                pass
        except (OSError, TimeoutError, urllib.error.URLError) as e:
            logger.warning(f"Failed to export OTLP JSON span: {e}")


def _start_span(config: dict, context: dict, name: str, attributes: dict[str, Any]):
    if config.get("otel_enabled", True) is False:
        return nullcontext(None)
    traceparent = context.get("traceparent")
    if not traceparent:
        return nullcontext(None)
    if _TRACEPARENT_RE.match(traceparent) is None:
        logger.warning(f"Ignoring invalid traceparent: {traceparent}")
        return nullcontext(None)
    return OtlpJsonSpan(
        endpoint=_otel_endpoint(config),
        traceparent=traceparent,
        name=name,
        attributes=attributes,
    )


def _set_span_attributes(span, attributes: dict[str, Any]):
    if span is None:
        return
    for key, value in _span_attributes(attributes).items():
        span.set_attribute(key, value)


def _record_span_exception(span, error: Exception):
    if span is None:
        return
    try:
        span.record_exception(error)
    except Exception:
        logger.debug("Failed to record OpenTelemetry span exception", exc_info=True)


def _get_pipeline(
    model: str,
    defense: str | None,
    request_timeout: float | None = DEFAULT_REQUEST_TIMEOUT,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
):
    """Get or create cached pipeline.

    Supports both registered AgentDojo models and custom OpenAI models like gpt-5.4.
    """
    from agentdojo.agent_pipeline import AgentPipeline, PipelineConfig

    key = f"{model}:{defense}:{request_timeout}:{max_output_tokens}"
    if key not in _pipeline_cache:
        if _is_registered_agentdojo_model(model):
            config = PipelineConfig(
                llm=model,
                model_id=model,
                defense=defense,
                system_message_name=None,
                system_message=None,
            )
            _pipeline_cache[key] = AgentPipeline.from_config(config)
        else:
            # Model not in registry - create custom OpenAI LLM. AgentDojo still
            # needs a recognized pipeline name so attacks can address the model.
            from collections.abc import Sequence

            import openai
            from agentdojo.agent_pipeline.base_pipeline_element import (
                BasePipelineElement,
            )
            from agentdojo.agent_pipeline.llms.openai_llm import OpenAILLM
            from agentdojo.types import ChatAssistantMessage, ChatMessage

            if defense == "tool_filter":
                raise ValueError(
                    "tool_filter is only supported for AgentDojo-registered OpenAI "
                    "models. Use gpt-4o-2024-05-13 or choose a custom-model-safe "
                    "defense such as spotlighting_with_delimiting or repeat_user_prompt."
                )

            client = (
                openai.OpenAI(timeout=request_timeout)
                if request_timeout
                else openai.OpenAI()
            )
            pipeline_llm_name = _agentdojo_model_alias(model)

            # For newer models - use Responses API for gpt-5.x, Chat Completions for o1/o3
            use_responses_api = "gpt-5" in model.lower()
            use_custom_llm = (
                use_responses_api or "o1" in model.lower() or "o3" in model.lower()
            )

            if use_custom_llm:
                from agentdojo.functions_runtime import (
                    EmptyEnv,
                    Env,
                    FunctionCall,
                    FunctionsRuntime,
                )
                from agentdojo.types import text_content_block_from_string
                from openai._types import NOT_GIVEN

                # Create a custom LLM wrapper for newer models
                class CustomOpenAILLM(BasePipelineElement):
                    def __init__(
                        self,
                        llm_client,
                        llm_model,
                        llm_name,
                        max_tokens,
                        use_responses_api=False,
                    ):
                        self.client = llm_client
                        self.model = llm_model
                        self.name = llm_name
                        self.max_output_tokens = max_tokens
                        self.use_responses_api = use_responses_api

                    def _message_to_openai(self, message: ChatMessage) -> dict:
                        """Convert AgentDojo message to OpenAI format."""
                        role = message["role"]
                        content = message.get("content")

                        # Handle content that may be a list of blocks
                        if content is not None:
                            if isinstance(content, list):
                                text_parts = []
                                for block in content:
                                    if isinstance(block, dict) and "content" in block:
                                        text_parts.append(block["content"] or "")
                                    elif isinstance(block, str):
                                        text_parts.append(block)
                                content = "".join(text_parts)
                            elif not isinstance(content, str):
                                content = str(content)

                        if role == "system":
                            return {"role": "developer", "content": content}
                        elif role == "user":
                            return {"role": "user", "content": content}
                        elif role == "assistant":
                            result = {"role": "assistant", "content": content}
                            if message.get("tool_calls"):
                                result["tool_calls"] = [
                                    {
                                        "id": tc.id
                                        if hasattr(tc, "id")
                                        else tc.get("id"),
                                        "type": "function",
                                        "function": {
                                            "name": tc.function
                                            if hasattr(tc, "function")
                                            else tc.get("function"),
                                            "arguments": json.dumps(
                                                tc.args
                                                if hasattr(tc, "args")
                                                else tc.get("args", {})
                                            ),
                                        },
                                    }
                                    for tc in message["tool_calls"]
                                ]
                            return result
                        elif role == "tool":
                            tool_content = content
                            if message.get("error"):
                                tool_content = message["error"]
                            return {
                                "role": "tool",
                                "content": tool_content,
                                "tool_call_id": message.get("tool_call_id"),
                            }
                        return {"role": role, "content": content}

                    def _function_to_openai_chat(self, func) -> dict:
                        """Convert AgentDojo function to OpenAI Chat Completions tool format."""
                        return {
                            "type": "function",
                            "function": {
                                "name": func.name,
                                "description": func.description,
                                "parameters": func.parameters.model_json_schema(),
                            },
                        }

                    def _function_to_openai_responses(self, func) -> dict:
                        """Convert AgentDojo function to OpenAI Responses API tool format."""
                        return {
                            "type": "function",
                            "name": func.name,
                            "description": func.description,
                            "parameters": func.parameters.model_json_schema(),
                        }

                    def _call_responses_api(self, oai_messages, oai_tools):
                        """Call OpenAI Responses API for gpt-5.x models."""
                        # Build input for responses API
                        input_items = []
                        for msg in oai_messages:
                            role = msg["role"]
                            content = msg.get("content", "")

                            if role == "developer":
                                input_items.append(
                                    {
                                        "type": "message",
                                        "role": "developer",
                                        "content": content,
                                    }
                                )
                            elif role == "user":
                                input_items.append(
                                    {
                                        "type": "message",
                                        "role": "user",
                                        "content": content,
                                    }
                                )
                            elif role == "assistant":
                                item = {
                                    "type": "message",
                                    "role": "assistant",
                                    "content": content or "",
                                }
                                input_items.append(item)
                                # Add function calls as separate items
                                if msg.get("tool_calls"):
                                    for tc in msg["tool_calls"]:
                                        input_items.append(
                                            {
                                                "type": "function_call",
                                                "call_id": tc["id"],
                                                "name": tc["function"]["name"],
                                                "arguments": tc["function"][
                                                    "arguments"
                                                ],
                                            }
                                        )
                            elif role == "tool":
                                input_items.append(
                                    {
                                        "type": "function_call_output",
                                        "call_id": msg.get("tool_call_id"),
                                        "output": content,
                                    }
                                )

                        # Call responses API
                        response = self.client.responses.create(
                            model=self.model,
                            input=input_items,
                            tools=oai_tools if oai_tools else NOT_GIVEN,
                            max_output_tokens=self.max_output_tokens,
                        )

                        # Accumulate token usage
                        _accumulate_tokens(response.usage)

                        # Extract text and tool calls from response
                        text_content = ""
                        tool_calls_list = []

                        for item in response.output:
                            if item.type == "message":
                                for content_block in item.content:
                                    if content_block.type == "output_text":
                                        text_content += content_block.text
                            elif item.type == "function_call":
                                # Responses API uses call_id for the function call identifier
                                tool_calls_list.append(
                                    {
                                        "id": item.call_id,
                                        "function_name": item.name,
                                        "arguments": item.arguments,
                                    }
                                )

                        return text_content, tool_calls_list

                    def _call_chat_completions_api(self, oai_messages, oai_tools):
                        """Call OpenAI Chat Completions API for o1/o3 models."""
                        response = self.client.chat.completions.create(
                            model=self.model,
                            messages=oai_messages,
                            tools=oai_tools if oai_tools else NOT_GIVEN,
                            tool_choice="auto" if oai_tools else NOT_GIVEN,
                            max_completion_tokens=self.max_output_tokens,
                        )

                        # Accumulate token usage
                        _accumulate_tokens(response.usage)

                        choice = response.choices[0]
                        msg = choice.message

                        text_content = msg.content or ""
                        tool_calls_list = []
                        if msg.tool_calls:
                            for tc in msg.tool_calls:
                                tool_calls_list.append(
                                    {
                                        "id": tc.id,
                                        "function_name": tc.function.name,
                                        "arguments": tc.function.arguments,
                                    }
                                )

                        return text_content, tool_calls_list

                    def query(
                        self,
                        query_str: str,
                        runtime: FunctionsRuntime,
                        env: Env | None = None,
                        messages: Sequence[ChatMessage] | None = None,
                        extra_args: dict | None = None,
                    ) -> tuple[str, FunctionsRuntime, Env, Sequence[ChatMessage], dict]:
                        # Handle mutable default arguments
                        if env is None:
                            env = EmptyEnv()
                        if messages is None:
                            messages = []
                        if extra_args is None:
                            extra_args = {}
                        # Convert messages to OpenAI format
                        oai_messages = [
                            self._message_to_openai(msg) for msg in messages
                        ]

                        # Build tools list from runtime using appropriate format
                        if self.use_responses_api:
                            oai_tools = [
                                self._function_to_openai_responses(func)
                                for func in runtime.functions.values()
                            ]
                        else:
                            oai_tools = [
                                self._function_to_openai_chat(func)
                                for func in runtime.functions.values()
                            ]

                        # Call appropriate API
                        if self.use_responses_api:
                            text_content, tool_calls_list = self._call_responses_api(
                                oai_messages, oai_tools
                            )
                        else:
                            text_content, tool_calls_list = (
                                self._call_chat_completions_api(oai_messages, oai_tools)
                            )

                        # Convert tool calls to FunctionCall objects
                        tool_calls = None
                        if tool_calls_list:
                            tool_calls = [
                                FunctionCall(
                                    function=tc["function_name"],
                                    args=json.loads(tc["arguments"])
                                    if tc["arguments"]
                                    else {},
                                    id=tc["id"],
                                )
                                for tc in tool_calls_list
                            ]

                        # Build content as list of content blocks
                        content = None
                        if text_content:
                            content = [text_content_block_from_string(text_content)]

                        output = ChatAssistantMessage(
                            role="assistant",
                            content=content,
                            tool_calls=tool_calls,
                        )
                        new_messages = [*messages, output]
                        return query_str, runtime, env, new_messages, extra_args

                llm = CustomOpenAILLM(
                    llm_client=client,
                    llm_model=model,
                    llm_name=pipeline_llm_name,
                    max_tokens=max_output_tokens,
                    use_responses_api=use_responses_api,
                )
            else:
                llm = OpenAILLM(client=client, model=model)
                llm.name = pipeline_llm_name

            config = PipelineConfig(
                llm=llm,
                model_id=model,
                defense=defense,
                system_message_name=None,
                system_message=None,
            )
            _pipeline_cache[key] = AgentPipeline.from_config(config)
    return _pipeline_cache[key]


def _get_suite(suite_name: str, version: str):
    """Get or create cached suite."""
    from agentdojo.task_suite import get_suite

    key = f"{version}:{suite_name}"
    if key not in _suite_cache:
        _suite_cache[key] = get_suite(version, suite_name)
    return _suite_cache[key]


def _get_attack(attack_name: str, suite, pipeline):
    """Get or create cached attack."""
    from agentdojo.attacks import load_attack

    # Attack depends on suite and pipeline, so include their ids in key
    key = f"{attack_name}:{id(suite)}:{id(pipeline)}"
    if key not in _attack_cache:
        _attack_cache[key] = load_attack(attack_name, suite, pipeline)
    return _attack_cache[key]


def _setup_logger(logdir: Path):
    """Set up AgentDojo logging to file."""
    from agentdojo.logging import LOGGER_STACK, OutputLogger

    logdir.mkdir(parents=True, exist_ok=True)
    output_logger = OutputLogger(logdir=str(logdir), live=None)
    LOGGER_STACK.set([output_logger])


def _read_agentdojo_log(
    logdir: Path,
    pipeline_name: str,
    suite_name: str,
    user_task_id: str,
    attack_name: str,
    injection_task_id: str | None,
) -> dict | None:
    """Read the AgentDojo trace log for a specific task.

    AgentDojo saves logs at: {logdir}/{pipeline}/{suite}/{user_task}/{attack}/{injection_task}.json
    Pipeline names with slashes are converted to underscores in the path.

    Returns:
        The parsed JSON log dict, or None if the file doesn't exist or is invalid.
    """
    safe_pipeline_name = pipeline_name.replace("/", "_")
    log_file = (
        logdir
        / safe_pipeline_name
        / suite_name
        / user_task_id
        / attack_name
        / f"{injection_task_id or 'none'}.json"
    )
    if log_file.exists():
        try:
            with open(log_file, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to read AgentDojo log {log_file}: {e}")
            return None
    return None


def _extract_content_text(content: Any) -> str:
    """Extract text from AgentDojo content which may be string, list of blocks, or None."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and "content" in block:
                parts.append(block.get("content") or "")
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content)


def _format_trace_messages(trace_log: dict | None) -> list[dict]:
    """Format AgentDojo trace messages into Hydra-style message history.

    Transforms raw AgentDojo message format into a cleaner structure similar to
    Promptfoo's Hydra provider redteamHistory pattern.

    Returns:
        List of message dicts with keys: role, content, and optionally tool_calls/tool_call_id.
    """
    if not trace_log:
        return []

    raw_messages = trace_log.get("messages", [])
    formatted = []

    for msg in raw_messages:
        role = msg.get("role", "unknown")
        content = _extract_content_text(msg.get("content"))

        formatted_msg: dict[str, Any] = {
            "role": role,
            "content": content,
        }

        # Include tool calls for assistant messages
        if role == "assistant" and msg.get("tool_calls"):
            tool_calls = []
            for tc in msg["tool_calls"]:
                # Handle both object-style and dict-style tool calls
                if hasattr(tc, "function"):
                    tool_calls.append(
                        {
                            "id": getattr(tc, "id", None),
                            "function": getattr(tc, "function", ""),
                            "args": getattr(tc, "args", {}),
                        }
                    )
                elif isinstance(tc, dict):
                    tool_calls.append(
                        {
                            "id": tc.get("id"),
                            "function": tc.get("function", ""),
                            "args": tc.get("args", {}),
                        }
                    )
            if tool_calls:
                formatted_msg["tool_calls"] = tool_calls

        # Include tool call ID for tool responses
        if role == "tool":
            if msg.get("tool_call_id"):
                formatted_msg["tool_call_id"] = msg["tool_call_id"]
            if msg.get("error"):
                formatted_msg["error"] = msg["error"]

        formatted.append(formatted_msg)

    return formatted


def call_api(prompt: str, options: dict, context: dict) -> dict:
    """
    Promptfoo provider entry point.

    Runs a single AgentDojo task with injection and returns results.

    Args:
        prompt: The rendered prompt (contains task info but actual execution
                uses vars for precise control)
        options: Provider configuration from promptfooconfig.yaml
        context: Contains 'vars' dict with task identifiers

    Returns:
        dict with:
            - output: JSON string with results
            - metadata: Structured result data
            - error: Error message if execution failed
    """
    from agentdojo.benchmark import run_task_with_injection_tasks

    config = options.get("config", {})
    vars_ = context.get("vars", {})

    # Get configuration (vars override config)
    suite_name = vars_.get("suite", config.get("suite", "workspace"))
    model = vars_.get("model", config.get("model", "gpt-4o"))
    defense = vars_.get("defense", config.get("defense"))
    attack_name = vars_.get("attack", config.get("attack", "important_instructions"))
    user_task_id = vars_.get("user_task_id", "user_task_0")
    injection_task_id = vars_.get("injection_task_id")
    version = config.get("version", "v1.2.2")
    request_timeout = config.get("request_timeout", DEFAULT_REQUEST_TIMEOUT)
    if request_timeout is not None:
        request_timeout = float(request_timeout)
    max_output_tokens = int(config.get("max_output_tokens", DEFAULT_MAX_OUTPUT_TOKENS))
    force_rerun = bool(config.get("force_rerun", True))

    # Log directory for AgentDojo - resolve relative to this file's directory
    config_logdir = config.get("logdir", "./agentdojo_logs")
    if not os.path.isabs(config_logdir):
        # Resolve relative to this provider file's directory
        base_logdir = Path(__file__).parent / config_logdir
    else:
        base_logdir = Path(config_logdir)
    logdir = _run_logdir(base_logdir, model, defense, attack_name)

    span_cm = _start_span(
        config,
        context or {},
        "agentdojo.task",
        {
            "agentdojo.suite": suite_name,
            "agentdojo.model": model,
            "agentdojo.defense": defense,
            "agentdojo.attack": attack_name,
            "agentdojo.user_task_id": user_task_id,
            "agentdojo.injection_task_id": injection_task_id,
            "agentdojo.force_rerun": force_rerun,
            "prompt.length": len(prompt or ""),
            "evaluation.id": context.get("evaluationId"),
            "test.case.id": context.get("testCaseId"),
            "promptfoo.evaluation_id": context.get("evaluationId"),
            "promptfoo.test_case_id": context.get("testCaseId"),
        },
    )
    span = span_cm.__enter__()

    try:
        # Reset token accumulator for this task execution
        _reset_token_usage()

        # Set up logging before any AgentDojo operations
        _setup_logger(logdir)

        # Get cached resources
        pipeline = _get_pipeline(
            model,
            defense,
            request_timeout=request_timeout,
            max_output_tokens=max_output_tokens,
        )
        suite = _get_suite(suite_name, version)
        attack = _get_attack(attack_name, suite, pipeline)
        _set_span_attributes(span, {"agentdojo.pipeline_name": pipeline.name})

        # Get the user task object
        user_task = suite.user_tasks[user_task_id]

        # Determine which injection tasks to run
        injection_tasks_to_run = [injection_task_id] if injection_task_id else None

        # Run the benchmark task
        utility_results, security_results = run_task_with_injection_tasks(
            suite=suite,
            agent_pipeline=pipeline,
            user_task=user_task,
            attack=attack,
            logdir=logdir,
            force_rerun=force_rerun,
            injection_tasks=injection_tasks_to_run,
        )

        # Process results
        if injection_task_id:
            # Single injection task - get specific result
            key = (user_task_id, injection_task_id)
            utility = utility_results.get(key, False)
            security = security_results.get(key, True)
        else:
            # All injection tasks - aggregate (worst case for security)
            utility = all(utility_results.values()) if utility_results else False
            security = all(security_results.values()) if security_results else True

        # Read the AgentDojo trace log to include in metadata
        trace_log = _read_agentdojo_log(
            logdir=logdir,
            pipeline_name=pipeline.name,
            suite_name=suite_name,
            user_task_id=user_task_id,
            attack_name=attack_name,
            injection_task_id=injection_task_id,
        )

        # Format trace messages into clean message history (like Hydra's redteamHistory)
        messages = _format_trace_messages(trace_log)

        # Extract the final assistant response for output
        final_response = ""
        for msg in reversed(messages):
            if msg.get("role") == "assistant" and msg.get("content"):
                final_response = msg["content"]
                break

        # Build result
        result = {
            "user_task_success": utility,
            "injection_blocked": security,
            "injection_success": not security,
            "safe_utility": utility and security,
            "suite": suite_name,
            "user_task_id": user_task_id,
            "injection_task_id": injection_task_id,
            "model": model,
            "defense": defense,
            "attack": attack_name,
            "agentdojo_pipeline_name": pipeline.name,
            "force_rerun": force_rerun,
            "num_utility_results": len(utility_results),
            "num_security_results": len(security_results),
        }

        # Include formatted messages and raw trace in metadata
        metadata = {**result}
        if context.get("traceparent"):
            metadata["traceparent"] = context["traceparent"]
        if context.get("evaluationId"):
            metadata["evaluationId"] = context["evaluationId"]
        if context.get("testCaseId"):
            metadata["testCaseId"] = context["testCaseId"]
        if messages:
            metadata["messages"] = messages
        if trace_log:
            metadata["agentdojo_trace"] = trace_log

        # Build token usage in Promptfoo format
        token_usage = None
        if _token_usage["total"] > 0:
            token_usage = {
                "prompt": _token_usage["prompt"],
                "completion": _token_usage["completion"],
                "total": _token_usage["total"],
            }

        _set_span_attributes(
            span,
            {
                "agentdojo.user_task_success": utility,
                "agentdojo.injection_blocked": security,
                "agentdojo.safe_utility": utility and security,
                "llm.usage.prompt_tokens": _token_usage["prompt"],
                "llm.usage.completion_tokens": _token_usage["completion"],
                "llm.usage.total_tokens": _token_usage["total"],
            },
        )

        return {
            "output": final_response if final_response else json.dumps(result),
            "metadata": metadata,
            "tokenUsage": token_usage,
        }

    except Exception as e:
        _record_span_exception(span, e)
        logger.exception(f"AgentDojo provider error: {e}")
        error_result = {
            "error": str(e),
            "user_task_success": False,
            "injection_blocked": False,
            "injection_success": True,
            "safe_utility": False,
            "suite": suite_name,
            "user_task_id": user_task_id,
            "injection_task_id": injection_task_id,
            "model": model,
            "defense": defense,
            "attack": attack_name,
        }
        return {
            "output": json.dumps(error_result),
            "error": str(e),
            "metadata": error_result,
        }
    finally:
        span_cm.__exit__(None, None, None)
