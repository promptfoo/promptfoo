"""
ChatKit Backend Wrapper for OpenAI Agents SDK

This module provides a bridge between the ChatKit protocol and the OpenAI Agents SDK,
allowing Agent Builder workflows to be tested via ChatKit's HTTP/SSE interface.
"""

from collections.abc import AsyncIterator
from typing import Any
from agents import Agent, Runner
from chatkit.server import ChatKitServer
from chatkit.agents import stream_agent_response, AgentContext
from chatkit.store import Store, NotFoundError
from chatkit.types import ThreadMetadata, UserMessageItem, ThreadStreamEvent, ThreadItem, Attachment, Page


class SimpleInMemoryStore(Store[dict]):
    """
    Simple in-memory store for ChatKit backend.

    This stores all threads, items, and attachments in memory using Python dictionaries.
    Data is not persisted - it's lost when the server restarts.

    For production, use a persistent store (SQLite, PostgreSQL, Redis, etc.)
    """

    def __init__(self):
        self.threads: dict[str, ThreadMetadata] = {}
        self.items: dict[str, dict[str, ThreadItem]] = {}  # thread_id -> {item_id -> item}
        self.attachments: dict[str, Attachment] = {}

    async def load_thread(self, thread_id: str, context: dict) -> ThreadMetadata:
        if thread_id not in self.threads:
            raise NotFoundError(f"Thread {thread_id} not found")
        return self.threads[thread_id]

    async def save_thread(self, thread: ThreadMetadata, context: dict) -> None:
        self.threads[thread.id] = thread

    async def load_thread_items(
        self,
        thread_id: str,
        after: str | None,
        limit: int,
        order: str,
        context: dict,
    ) -> Page[ThreadItem]:
        if thread_id not in self.items:
            return Page[ThreadItem](data=[], has_more=False, after=None)

        items = list(self.items[thread_id].values())

        # Sort by created_at
        reverse = order == "desc"
        items.sort(key=lambda x: x.created_at, reverse=reverse)

        # Filter by 'after' if provided
        if after:
            after_found = False
            filtered_items = []
            for item in items:
                if after_found:
                    filtered_items.append(item)
                elif item.id == after:
                    after_found = True
            items = filtered_items

        # Paginate
        has_more = len(items) > limit
        data = items[:limit]
        next_after = data[-1].id if has_more and data else None

        return Page[ThreadItem](data=data, has_more=has_more, after=next_after)

    async def add_thread_item(self, thread_id: str, item: ThreadItem, context: dict) -> None:
        if thread_id not in self.items:
            self.items[thread_id] = {}
        self.items[thread_id][item.id] = item

    async def save_item(self, thread_id: str, item: ThreadItem, context: dict) -> None:
        if thread_id not in self.items:
            self.items[thread_id] = {}
        self.items[thread_id][item.id] = item

    async def load_item(self, thread_id: str, item_id: str, context: dict) -> ThreadItem:
        if thread_id not in self.items or item_id not in self.items[thread_id]:
            raise NotFoundError(f"Item {item_id} not found in thread {thread_id}")
        return self.items[thread_id][item_id]

    async def delete_thread(self, thread_id: str, context: dict) -> None:
        self.threads.pop(thread_id, None)
        self.items.pop(thread_id, None)

    async def delete_thread_item(self, thread_id: str, item_id: str, context: dict) -> None:
        if thread_id in self.items:
            self.items[thread_id].pop(item_id, None)

    async def save_attachment(self, attachment: Attachment, context: dict) -> None:
        self.attachments[attachment.id] = attachment

    async def load_attachment(self, attachment_id: str, context: dict) -> Attachment:
        if attachment_id not in self.attachments:
            raise NotFoundError(f"Attachment {attachment_id} not found")
        return self.attachments[attachment_id]

    async def delete_attachment(self, attachment_id: str, context: dict) -> None:
        self.attachments.pop(attachment_id, None)

    async def load_threads(
        self,
        limit: int,
        after: str | None,
        order: str,
        context: dict,
    ) -> Page[ThreadMetadata]:
        threads = list(self.threads.values())

        # Sort by created_at
        reverse = order == "desc"
        threads.sort(key=lambda x: x.created_at, reverse=reverse)

        # Filter by 'after' if provided
        if after:
            after_found = False
            filtered_threads = []
            for thread in threads:
                if after_found:
                    filtered_threads.append(thread)
                elif thread.id == after:
                    after_found = True
            threads = filtered_threads

        # Paginate
        has_more = len(threads) > limit
        data = threads[:limit]
        next_after = data[-1].id if has_more and data else None

        return Page[ThreadMetadata](data=data, has_more=has_more, after=next_after)


class AgentBuilderBackend(ChatKitServer):
    """
    ChatKit backend that wraps an Agents SDK agent.

    This class implements the ChatKit server protocol while delegating
    the actual agent logic to the Agents SDK. It converts between:
    - ChatKit's thread/message model → Agents SDK input
    - Agents SDK streaming output → ChatKit SSE events

    Args:
        agent: An Agents SDK Agent instance (from Agent Builder export)

    Example:
        ```python
        from agents import Agent
        from agent_wrapper import AgentBuilderBackend

        # Your exported agent
        agent = Agent(
            name="Support Agent",
            model="gpt-5-mini",
            instructions="You are a helpful support agent...",
        )

        # Wrap it with ChatKit protocol
        backend = AgentBuilderBackend(agent)

        # Use with FastAPI
        @app.post("/chatkit")
        async def endpoint(request: Request):
            result = await backend.process(await request.body(), {})
            return StreamingResponse(result, media_type="text/event-stream")
        ```
    """

    def __init__(self, agent: Agent):
        """
        Initialize the backend with an Agents SDK agent.

        Args:
            agent: The Agents SDK agent to wrap
        """
        # Use in-memory store for simplicity
        # In production, use persistent storage (DB, Redis, etc.)
        super().__init__(store=SimpleInMemoryStore())
        self.agent = agent

    async def respond(
        self,
        thread: ThreadMetadata,
        input_message: UserMessageItem | None,
        context: dict,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """
        Process a user message and stream ChatKit events.

        This is the core method that:
        1. Extracts the user's message
        2. Runs the Agents SDK agent
        3. Converts agent output to ChatKit events

        Args:
            thread: Metadata about the current conversation thread
            input_message: The user's message (None for tool outputs/retries)
            context: Request context (can store auth, user data, etc.)

        Yields:
            ChatKit ThreadStreamEvent objects (ThreadItemAdded, ThreadItemUpdated, etc.)
        """
        # Handle cases where there's no input message
        # (e.g., after tool call completion)
        if not input_message:
            return

        # Extract user's text from ChatKit message format
        # ChatKit messages can have multiple content parts
        user_input = ""
        for content_part in input_message.content:
            if hasattr(content_part, 'text'):
                user_input += content_part.text

        if not user_input.strip():
            return

        # Run the Agents SDK agent
        # This returns a streaming result that we'll convert to ChatKit events
        result = Runner.run_streamed(self.agent, user_input)

        # Create AgentContext for event conversion
        # This provides utilities for generating ChatKit events
        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context,
        )

        # Stream agent response as ChatKit events
        # stream_agent_response handles the conversion from Agents SDK
        # streaming events to ChatKit protocol events
        async for event in stream_agent_response(agent_context, result):
            yield event


class AgentBuilderBackendWithTools(AgentBuilderBackend):
    """
    Extended backend that demonstrates custom tool handling.

    This shows how to add tool call interception, logging, or
    custom business logic around agent execution.

    Example:
        ```python
        class MyBackend(AgentBuilderBackendWithTools):
            async def on_tool_call(self, tool_name, arguments):
                # Log tool usage
                logger.info(f"Agent called tool: {tool_name}")

                # Add custom logic
                if tool_name == "sensitive_operation":
                    # Check permissions
                    if not self.has_permission(tool_name):
                        raise PermissionError("Not authorized")

                return await super().on_tool_call(tool_name, arguments)
        ```
    """

    async def on_tool_call(self, tool_name: str, arguments: dict) -> dict:
        """
        Hook called before tool execution.

        Override this to add logging, validation, or custom logic.

        Args:
            tool_name: Name of the tool being called
            arguments: Tool arguments

        Returns:
            Tool result (or raise exception to prevent execution)
        """
        # Default: just pass through
        # Override in subclass for custom behavior
        return {}


class AgentBuilderBackendWithHistory(AgentBuilderBackend):
    """
    Backend that includes conversation history in agent input.

    This demonstrates how to provide conversation context to the agent
    by loading previous messages from the thread.

    Example:
        ```python
        backend = AgentBuilderBackendWithHistory(agent, max_history=10)
        ```
    """

    def __init__(self, agent: Agent, max_history: int = 10):
        """
        Initialize with history support.

        Args:
            agent: The Agents SDK agent
            max_history: Maximum number of previous messages to include
        """
        super().__init__(agent)
        self.max_history = max_history

    async def respond(
        self,
        thread: ThreadMetadata,
        input_message: UserMessageItem | None,
        context: dict,
    ) -> AsyncIterator[ThreadStreamEvent]:
        """
        Respond with conversation history context.

        This loads previous messages and includes them in the agent's input.
        """
        if not input_message:
            return

        # Load conversation history from store
        history_page = await self.store.load_thread_items(
            thread.id,
            limit=self.max_history,
            order="desc",
            context=context,
        )

        # Build conversation history
        # In production, you'd convert this to proper Agents SDK format
        # For now, we concatenate into a single prompt
        history_text = ""
        for item in reversed(history_page.data):
            if hasattr(item, 'content'):
                role = "User" if item.type == "user_message" else "Assistant"
                for content_part in item.content:
                    if hasattr(content_part, 'text'):
                        history_text += f"{role}: {content_part.text}\n"

        # Get current message
        user_input = ""
        for content_part in input_message.content:
            if hasattr(content_part, 'text'):
                user_input += content_part.text

        # Combine history + current message
        full_input = f"{history_text}User: {user_input}" if history_text else user_input

        # Run agent with context
        result = Runner.run_streamed(self.agent, full_input)

        # Stream response
        agent_context = AgentContext(
            thread=thread,
            store=self.store,
            request_context=context,
        )

        async for event in stream_agent_response(agent_context, result):
            yield event
