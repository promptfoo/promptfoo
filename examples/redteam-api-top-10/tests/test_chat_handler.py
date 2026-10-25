"""Exercise the example's chat and tool loop through the Anthropic SDK."""

import json
import unittest
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx2
from anthropic import Anthropic
from app.auth import UserContext, create_token
from app.main import app
from app.mcp_client import SwagMCPClient
from app.routers import chat as chat_router

from app import chat_handler


class ChatHandlerTest(unittest.IsolatedAsyncioTestCase):
    async def test_rejected_user_citations_do_not_poison_session(self) -> None:
        request = {
            "token": create_token({"user_id": "test", "full_name": "Ada"}),
            "session_id": "test-citations",
        }
        document = {
            "type": "document",
            "title": "Stock",
            "citations": {"enabled": True},
            "source": {"type": "text", "media_type": "text/plain", "data": "hat"},
        }
        citation = {
            "type": "char_location",
            "document_index": 0,
            "document_title": "Stock",
            "cited_text": "hat",
            "start_char_index": 0,
            "end_char_index": 3,
        }
        text = {"type": "text", "text": "hat", "citations": [citation]}
        search = {
            "type": "search_result",
            "source": "stock",
            "title": "Stock",
            "content": [text],
        }
        with (
            patch.dict(chat_router._sessions, clear=True),
            patch.object(chat_router, "chat", return_value=("Ready", [])) as chat,
        ):
            async with httpx2.AsyncClient(
                transport=httpx2.ASGITransport(app=app), base_url="http://app.test"
            ) as web:
                content_document = {
                    **document,
                    "source": {"type": "content", "content": [text]},
                }
                fetched = {
                    "type": "web_fetch_tool_result",
                    "tool_use_id": "fetch",
                    "content": {
                        "type": "web_fetch_result",
                        "url": "https://example.test",
                        "content": content_document,
                    },
                }
                for block in (text, search, content_document, fetched):
                    message = [{"role": "user", "content": [document, block]}]
                    response = await web.post(
                        "/chat/", json={**request, "message": message}
                    )
                    self.assertEqual(response.status_code, 422, response.text)
                    self.assertIn("citations", response.json()["detail"][0]["msg"])
                follow_up = {
                    **search,
                    "citations": {"enabled": True},
                    "content": [{"type": "text", "text": "Any hats?", "citations": []}],
                }
                response = await web.post(
                    "/chat/",
                    json={
                        **request,
                        "message": [{"role": "user", "content": [document, follow_up]}],
                    },
                )
                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.json()["response"], "Ready")
        chat.assert_awaited_once()
        self.assertEqual(chat.await_args.kwargs["message"], [document, follow_up])
        self.assertEqual(chat.await_args.kwargs["conversation_history"], [])

    async def test_anthropic_tool_round_trip(self) -> None:
        tool = {
            "name": "stock",
            "description": "Stock",
            "input_schema": {"type": "object"},
        }
        call = {
            "type": "tool_use",
            "id": "t1",
            "name": "stock",
            "input": {"item": "hat"},
        }
        server = AsyncMock()
        server.list_tools.return_value.tools = [SimpleNamespace(**tool)]
        server.call_tool.return_value.content = [SimpleNamespace(text="3 hats")]
        mcp = SwagMCPClient()
        mcp.sessions["store"] = server

        requests = []
        responses = iter(
            [("tool_use", call), ("end_turn", {"type": "text", "text": "3 hats left."})]
        )

        def respond(request: httpx2.Request) -> httpx2.Response:
            self.assertEqual(request.url.path, "/v1/messages")
            self.assertEqual(request.headers["authorization"], "Bearer test-key")
            body = json.loads(request.content)
            requests.append(body)
            stop_reason, block = next(responses)
            return httpx2.Response(
                200,
                json={
                    "id": "msg_test",
                    "type": "message",
                    "role": "assistant",
                    "model": body["model"],
                    "content": [block],
                    "stop_reason": stop_reason,
                    "stop_sequence": None,
                    "usage": {"input_tokens": 1, "output_tokens": 1},
                },
            )

        http = httpx2.Client(transport=httpx2.MockTransport(respond))
        self.addCleanup(http.close)
        client = partial(
            Anthropic, base_url="https://model.test", http_client=http, max_retries=0
        )
        with (
            patch.dict("os.environ", {"ANTHROPIC_CUSTOM_HEADERS": ""}),
            patch.object(chat_handler, "ANTHROPIC_API_KEY", "test-key"),
            patch.object(chat_handler, "Anthropic", client),
            patch.object(chat_handler, "get_mcp_client", return_value=mcp),
        ):
            answer, history = await chat_handler.ChatHandler().process_message(
                "Any hats?", UserContext(user_id="test", name="Ada")
            )

        server.call_tool.assert_awaited_once_with("stock", {"item": "hat"})
        first, second = requests
        self.assertEqual(first["tools"], [tool])
        result = {"type": "tool_result", "tool_use_id": "t1", "content": "3 hats"}
        conversation = [
            {"role": "user", "content": "Any hats?"},
            {"role": "assistant", "content": [call]},
            {"role": "user", "content": [result]},
        ]
        self.assertEqual(first["messages"], conversation[:1])
        self.assertEqual(second["messages"], conversation)
        self.assertEqual(answer, "3 hats left.")
        self.assertEqual(
            history, conversation + [{"role": "assistant", "content": answer}]
        )
